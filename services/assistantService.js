import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';

/**
 * Send a message to the Bela AI assistant
 * @param {string} message - The user's message
 * @returns {Promise<Object>} The assistant's response
 */
export const sendMessageToAssistant = async (message) => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      throw new Error('User not authenticated');
    }

    const response = await axios.post(
      `${API_BASE_URL}/api/assistant/chat`,
      { message },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error sending message to assistant:', error);
    throw error;
  }
};

/**
 * Process a voice command to create a task or meeting
 * @param {string} command - The voice command
 * @returns {Promise<Object>} The processed command result
 */
export const processVoiceCommand = async (command) => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      throw new Error('User not authenticated');
    }

    const response = await axios.post(
      `${API_BASE_URL}/api/assistant/process-command`,
      { command },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error processing voice command:', error);
    throw error;
  }
};

/**
 * Get the conversation history for the current user
 * @returns {Promise<Array>} The conversation history
 */
export const getConversationHistory = async () => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      return [];
    }

    const response = await axios.get(
      `${API_BASE_URL}/api/assistant/conversation`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    return response.data.messages || [];
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    return [];
  }
};

/**
 * Clear the conversation history for the current user
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export const clearConversationHistory = async () => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      return false;
    }

    await axios.delete(
      `${API_BASE_URL}/api/assistant/conversation`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    return true;
  } catch (error) {
    console.error('Error clearing conversation history:', error);
    return false;
  }
};
