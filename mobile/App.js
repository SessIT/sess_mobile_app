import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './screens/Login';
import DashboardScreen from './screens/DashboardScreen';
import { getAuth } from './lib/auth';
import UsersScreen from './screens/UserScreen';
import CreateUserScreen from './screens/CreateUserScreen';
import PunchScreen from './screens/PunchScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [checking, setChecking] = useState(true);
  const [savedAuth, setSavedAuth] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const auth = await getAuth();
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
        <Stack.Screen name="Punch" component={PunchScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}