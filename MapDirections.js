import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, TouchableOpacity, ActivityIndicator, Linking, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { Colors } from './constants/colors';
import { getReminder } from './services/api';

function decodePolyline(encoded) {
  // polyline algorithm
  let points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

export default function MapDirections({ route, navigation }) {
  const { reminderId, destLat, destLng, destName } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(null);
  const [destination, setDestination] = useState(null);
  const [polyline, setPolyline] = useState([]);
  const mapRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // 1) Permissions and current location
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          setError('Location permission not granted');
          setLoading(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const cur = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setCurrent(cur);

        // 2) Destination from params or API / Places search
        let dest = null;
        if (typeof destLat === 'number' && typeof destLng === 'number') {
          dest = { latitude: destLat, longitude: destLng, name: destName || 'Destination' };
        } else if (reminderId) {
          try {
            const r = await getReminder(reminderId);
            const data = r?.data || r?.reminder || r;
            // New flow: location field may be removed; prefer triggeredLocation if present
            const tLat = data?.triggeredLocation?.lat;
            const tLng = data?.triggeredLocation?.lng;
            const tName = data?.triggeredLocation?.name || data?.title || 'Destination';
            if (typeof tLat === 'number' && typeof tLng === 'number') {
              dest = { latitude: tLat, longitude: tLng, name: tName };
            } else {
              // Fallback: search by title near current location using Google Places Text Search
              const title = data?.title;
              const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
              if (title && key) {
                try {
                  const locBias = `${cur.latitude},${cur.longitude}`;
                  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(title)}&location=${encodeURIComponent(locBias)}&radius=3000&key=${encodeURIComponent(key)}`;
                  const resp = await fetch(url);
                  const j = await resp.json();
                  const first = j?.results?.[0];
                  const plat = first?.geometry?.location?.lat;
                  const plng = first?.geometry?.location?.lng;
                  const pname = first?.name || title;
                  if (typeof plat === 'number' && typeof plng === 'number') {
                    dest = { latitude: plat, longitude: plng, name: pname };
                  }
                } catch {}
              }
            }
          } catch {}
        }
        if (!dest) {
          setError('Destination not found for this reminder');
          setLoading(false);
          return;
        }
        setDestination(dest);

        // 3) Fetch Google Directions
        try {
          const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
          const origin = `${cur.latitude},${cur.longitude}`;
          const destinationStr = `${dest.latitude},${dest.longitude}`;
          const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destinationStr)}&mode=driving&key=${encodeURIComponent(key || '')}`;
          const res = await fetch(url);
          const json = await res.json();
          const route0 = json?.routes?.[0];
          const points = route0?.overview_polyline?.points ? decodePolyline(route0.overview_polyline.points) : [];
          setPolyline(points);

          // Fit map
          setTimeout(() => {
            try {
              const coords = [cur, { latitude: dest.latitude, longitude: dest.longitude }];
              if (mapRef.current && coords.length === 2) {
                mapRef.current.fitToCoordinates(coords, { edgePadding: { top: 80, right: 80, bottom: 80, left: 80 }, animated: true });
              }
            } catch {}
          }, 300);
        } catch (e) {
          // show map without polyline
        }
      } catch (e) {
        setError('Failed to get directions');
      } finally {
        setLoading(false);
      }
    })();
  }, [reminderId, destLat, destLng]);

  const openInGoogleMaps = () => {
    if (!current || !destination) return;
    const origin = `${current.latitude},${current.longitude}`;
    const dest = `${destination.latitude},${destination.longitude}`;
    const url = Platform.select({
      ios: `http://maps.apple.com/?saddr=${origin}&daddr=${dest}`,
      android: `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`,
      default: `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`,
    });
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.backgroundStatus} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="chevron-left" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{destination?.name || 'Directions'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
        ) : error ? (
          <View style={styles.center}><Text style={{ color: Colors.text }}>{error}</Text></View>
        ) : (
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude: current?.latitude || 37.78825,
              longitude: current?.longitude || -122.4324,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
          >
            {current && (
              <Marker coordinate={current} title="You" pinColor="blue" />
            )}
            {destination && (
              <Marker coordinate={{ latitude: destination.latitude, longitude: destination.longitude }} title={destination.name || 'Destination'} />
            )}
            {polyline && polyline.length > 1 && (
              <Polyline coordinates={polyline} strokeColor="#4668FF" strokeWidth={5} />
            )}
          </MapView>
        )}
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.navigateBtn} onPress={openInGoogleMaps} disabled={!current || !destination}>
          <Feather name="navigation" size={18} color={Colors.black} />
          <Text style={styles.navigateText}>Open in Google Maps</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, paddingTop: 35, backgroundColor: Colors.background },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: 'bold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomBar: { padding: 12, backgroundColor: Colors.background },
  navigateBtn: { flexDirection: 'row', backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  navigateText: { marginLeft: 8, color: Colors.black, fontWeight: '700' },
});
