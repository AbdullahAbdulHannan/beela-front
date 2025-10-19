import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Image } from 'react-native';

export default function SuccessModal({ visible, message, onClose, gifUrl }) {
  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      onRequestClose={() => {}} // Prevent closing on back button
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          

          {/* Message */}
          <Text style={styles.message}>{message}</Text>

          {/* GIF/Image */}
          <View style={styles.gifContainer}>
            <Image 
              source={gifUrl || require('../assets/robot.gif')} 
              style={styles.gif}
              resizeMode="contain"
            />
          </View>

          {/* OK Button */}
          <TouchableOpacity 
            style={styles.okButton}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.okButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Example usage component
export function ExampleScreen() {
  const [modalVisible, setModalVisible] = React.useState(false);

  return (
    <View style={styles.exampleContainer}>
      <TouchableOpacity 
        style={styles.triggerButton}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.triggerButtonText}>Show Success Modal</Text>
      </TouchableOpacity>

      <SuccessModal
        visible={modalVisible}
        message="Reminder Saved Successfully!"
        onClose={() => setModalVisible(false)}
        gifUrl={require("../assets/robot.gif")} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FCFDFD',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '90%',
    maxWidth: 400,
    shadowColor: '#4668FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
 
  message: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1D2E',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 30,
  },
  gifContainer: {
    width: '100%',
    height: 300,
    marginBottom: 28,
    borderRadius: 16,
    overflow: 'hidden',
  },
  gif: {
    width: '100%',
    height: '100%',
  },
 
  okButtonText: {
    color: '#4668FF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // Example screen styles
  exampleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FD',
  },
  triggerButton: {
    backgroundColor: '#4668FF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
  },
  triggerButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});