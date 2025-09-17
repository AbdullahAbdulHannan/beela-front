import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Platform,
  StatusBar,
  Image, // Import the Image component
} from 'react-native';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import Navbar from './components/Navbar'; 
// Import the local image asset
import StarIcon from './assets/star_icon.png';

const MeetingsReminder = () => {
  const [tasks, setTasks] = useState([
    { id: '1', text: '10:00 AM: Pay bills', completed: false },
    { id: '2', text: 'Near Walmart: Buy groceries', completed: false },
    { id: '3', text: 'Near Walmart: Buy groceries', completed: false },
    { id: '4', text: 'Near Walmart: Buy groceries', completed: false },
  ]);

  const handleTaskToggle = (id) => {
    setTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    );
  };

  const smartSuggestions = [
    {
      id: '1',
      title: 'AI-Powered Insights',
      text: 'You usually grocery shop on Saturdays. Add a reminder?',
    },
    {
      id: '2',
      title: 'AI-Powered Insights',
      text: 'Your calendar shows a dentist appointment tomorrow.',
    },
    {
      id: '3',
      title: 'Routine Clustering',
      text: '3 errands near Downtown',
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollViewContent}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity>
              <Feather name="chevron-left" size={24} color="#D4AF37" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Meetings & Reminder</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Meeting Block */}
          <View style={styles.meetingBlock}>
            <View style={styles.starIconContainer}>
              {/* Replaced FontAwesome5 icon with the Image component */}
              <Image source={StarIcon} style={styles.starImage} />
            </View>
            <Text style={styles.meetingTimeText}>Meeting in 15 mins</Text>
          </View>

          {/* Today's Tasks Section */}
          <View style={styles.tasksSection}>
            <Text style={styles.sectionTitle}>Today's Tasks</Text>
            {tasks.map((task) => (
              <View key={task.id} style={styles.taskItem}>
                <TouchableOpacity
                  style={[styles.checkbox, task.completed && styles.checkboxCompleted]}
                  onPress={() => handleTaskToggle(task.id)}
                >
                  {task.completed && <Feather name="check" size={16} color="#000" />}
                </TouchableOpacity>
                <Text
                  style={[
                    styles.taskText,
                    task.completed && styles.completedTaskText,
                  ]}
                >
                  {task.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Plus Button */}
          <View style={styles.plusButtonContainer}>
            <TouchableOpacity style={styles.plusButtonCircle}>
              <Feather name="plus" size={30} color="#D4AF37" />
            </TouchableOpacity>
          </View>

          {/* Horizontal Add Buttons */}
          <View style={styles.horizontalButtonsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollView}>
              <TouchableOpacity style={styles.addButton}>
                <Text style={styles.addButtonText}>Add Task</Text>
                <Feather name="circle" size={16} color="#D4AF37" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButton}>
                <Text style={styles.addButtonText}>Add Meeting</Text>
                <Feather name="circle" size={16} color="#D4AF37" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButton}>
                <Text style={styles.addButtonText}>Add Location Reminder</Text>
                <Feather name="circle" size={16} color="#D4AF37" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButton}>
                <Text style={styles.addButtonText}>Add New</Text>
                <Feather name="circle" size={16} color="#D4AF37" />
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Smart Suggestions */}
          <View style={styles.smartSuggestionsSection}>
            <Text style={styles.sectionTitle}>Smart Suggestions</Text>
            <View style={styles.suggestionsGrid}>
              {smartSuggestions.map((suggestion, index) => (
                <View
                  key={suggestion.id}
                  style={[
                    styles.suggestionCard,
                    index === 2 && styles.suggestionCardFull,
                  ]}
                >
                  <View style={styles.suggestionHeader}>
                    <Feather name="circle" size={16} color="#D4AF37" />
                    <Text style={styles.suggestionTitle}>
                      {suggestion.title}
                    </Text>
                  </View>
                  <Text style={styles.suggestionText}>{suggestion.text}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* The pre-made Navbar component */}
      <Navbar />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  safeArea: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 220,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  meetingBlock: {
    alignItems: 'center',
    marginBottom: 25,
  },
  starIconContainer: {
    padding: 15,
    // backgroundColor: '#1C1C1C',
    borderRadius: 50,
    borderWidth: 2,
    // borderColor: '#D4AF37',
    marginTop: 15,
    marginBottom: 0,
  },
  starImage: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
    // tintColor: '#D4AF37', // This will change the color of the PNG if it's a solid-color icon
  },
  meetingTimeText: {
    color: '#fff',
    fontSize: 18,
    backgroundColor: '#1C1C1C',
    paddingHorizontal: 75,
    paddingVertical: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  tasksSection: {
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomColor: '#1C1C1C',
    borderBottomWidth: 1,
    borderRadius: 55,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#A9A9A9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkboxCompleted: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  taskText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  completedTaskText: {
    color: '#A9A9A9',
    textDecorationLine: 'line-through',
  },
  plusButtonContainer: {
    alignItems: 'center',
    marginVertical: 15,
  },
  plusButtonCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1C1C1C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  horizontalButtonsContainer: {
    marginBottom: 25,
  },
  horizontalScrollView: {
    alignItems: 'center',
    paddingRight: 15,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1C',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginRight: 15,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    marginRight: 8,
  },
  smartSuggestionsSection: {
    marginBottom: 20,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  suggestionCard: {
    width: '47%',
    backgroundColor: '#1C1C1C',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
  },
  suggestionCardFull: {
    width: '100%',
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  suggestionTitle: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  suggestionText: {
    color: '#fff',
    fontSize: 12,
  },
});

export default MeetingsReminder;