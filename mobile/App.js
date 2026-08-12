import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './screens/Login';
import DashboardScreen from './screens/DashboardScreen';
import { getAuth } from './lib/auth';
import UsersScreen from './screens/UserScreen';
import CreateUserScreen from './screens/CreateUserScreen';
import EditUserScreen from './screens/EditUserScreen';
import PunchScreen from './screens/PunchScreen';
import TeamTrailScreen from './screens/TeamTrailScreen';
import MyAttendanceScreen from './screens/MyAttendanceScreen';
import TeamAttendanceScreen from './screens/TeamAttendanceScreen';
import HolidaysScreen from './screens/HolidaysScreen';
import LeaveScreen from './screens/LeaveScreen';
import MyProfileScreen from './screens/MyProfileScreen';
import ChatListScreen from './screens/ChatListScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import ChatScreen from './screens/ChatScreen';
import LeaveApprovalsScreen from './screens/LeaveApprovalsScreen';
import OvertimeScreen from './screens/OvertimeScreen';
import OtApprovalsScreen from './screens/OtApprovalsScreen';
import CompOffScreen from './screens/CompOffScreen';
import CompOffApprovalsScreen from './screens/CompOffApprovalsScreen';
import ProfileMenuScreen from './screens/ProfileMenuScreen';
import TaskListScreen from './screens/TaskListScreen';
import NotesScreen from './screens/NotesScreen';
import SendNoteScreen from './screens/SendNoteScreen';
import MoreSettingsScreen from './screens/MoreSettingsScreen';
import LegalScreen from './screens/LegalScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [checking, setChecking] = useState(true);
  const [savedAuth, setSavedAuth] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const auth = await Promise.race([getAuth(), new Promise(r => setTimeout(() => r(null), 3000))]);
        if (auth && new Date(auth.expiresAt) > new Date()) {
          setSavedAuth(auth); // token valid — skip login
        }
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1E3A8A" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={savedAuth ? 'Dashboard' : 'Login'}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          initialParams={savedAuth ? { fullName: savedAuth.fullName, roles: savedAuth.roles } : undefined}
        />
        <Stack.Screen name="Users" component={UsersScreen} />
        <Stack.Screen name="CreateUser" component={CreateUserScreen} />
        <Stack.Screen name="EditUser" component={EditUserScreen} />
        <Stack.Screen name="Punch" component={PunchScreen} />
        <Stack.Screen name="TeamTrail" component={TeamTrailScreen} />
        <Stack.Screen name="MyAttendance" component={MyAttendanceScreen} />
        <Stack.Screen name="TeamAttendance" component={TeamAttendanceScreen} />
        <Stack.Screen name="Holidays" component={HolidaysScreen} />
        <Stack.Screen name="Leave" component={LeaveScreen} />
        <Stack.Screen name="MyProfile" component={ProfileMenuScreen} />
        <Stack.Screen name="ProfileDetail" component={MyProfileScreen} />
        <Stack.Screen name="ChatList" component={ChatListScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="LeaveApprovals" component={LeaveApprovalsScreen} />
        <Stack.Screen name="Overtime" component={OvertimeScreen} />
        <Stack.Screen name="OtApprovals" component={OtApprovalsScreen} />
        <Stack.Screen name="CompOff" component={CompOffScreen} />
        <Stack.Screen name="CompOffApprovals" component={CompOffApprovalsScreen} />
        <Stack.Screen name="TaskList" component={TaskListScreen} />
        <Stack.Screen name="Notes" component={NotesScreen} />
        <Stack.Screen name="SendNote" component={SendNoteScreen} />
        <Stack.Screen name="MoreSettings" component={MoreSettingsScreen} />
        <Stack.Screen name="Terms" component={LegalScreen} initialParams={{ doc: 'terms' }} />
        <Stack.Screen name="Privacy" component={LegalScreen} initialParams={{ doc: 'privacy' }} />
      </Stack.Navigator>
    </NavigationContainer>
    </SafeAreaProvider>
  );
}