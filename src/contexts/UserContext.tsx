import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { projectId, publicAnonKey } from "../utils/supabase/info";
import { supabase } from "../utils/supabase/client";
import { debugLog, debugError, debugWarn } from "../utils/debug";
import { showNotification } from "../utils/pwa";

interface UserProfile {
  name: string;
  age: number;
  gender: "male" | "female" | "other";
  weight: number; // kg
  height: number; // cm
  activityLevel: "sedentary" | "light" | "moderate" | "very";
  dayStartTime?: string; // "HH:MM"
  dayEndTime?: string; // "HH:MM"
}

interface NutritionalNeeds {
  dailyProtein: number; // gramos
  dailyFiber: number; // gramos
  dailyWater: number; // vasos (250ml cada uno)
  proteinPerMeal: number;
  fiberPerMeal: number;
}

interface MealIntake {
  protein: number;
  fiber: number;
}

interface DailyProgress {
  date: string;
  isBalanced: boolean;
  waterGlasses: number;
  totalProtein: number;
  totalFiber: number;
}

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastBalancedDate: string | null;
}

interface UserContextType {
  profile: UserProfile | null;
  nutritionalNeeds: NutritionalNeeds | null;
  userId: string | null;
  accessToken: string | null;
  userName: string | null;
  setAuth: (userId: string, accessToken: string, name: string) => void;
  setProfile: (profile: UserProfile) => Promise<void>;
  setUserProfile: (profile: UserProfile) => Promise<void>;
  mealIntakes: {
    breakfast: MealIntake;
    lunch: MealIntake;
    dinner: MealIntake;
  };
  updateMealIntake: (meal: "breakfast" | "lunch" | "dinner", intake: MealIntake) => Promise<void>;
  getTotalIntake: () => { protein: number; fiber: number };
  waterGlasses: number;
  addWater: (glasses?: number) => Promise<void>;
  dailyHistory: DailyProgress[];
  streakData: StreakData | null;
  checkAndUpdateDailyProgress: () => void;
  refreshData: () => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [nutritionalNeeds, setNutritionalNeeds] = useState<NutritionalNeeds | null>(null);
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [mealIntakes, setMealIntakes] = useState({
    breakfast: { protein: 0, fiber: 0 },
    lunch: { protein: 0, fiber: 0 },
    dinner: { protein: 0, fiber: 0 },
  });
  const [dailyHistory, setDailyHistory] = useState<DailyProgress[]>([]);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const setAuth = (newUserId: string, newAccessToken: string, name: string) => {
    setUserId(newUserId);
    setAccessToken(newAccessToken);
    setUserName(name);
    localStorage.setItem("lumi_user_id", newUserId);
    localStorage.setItem("lumi_access_token", newAccessToken);
    localStorage.setItem("lumi_user_name", name);
  };

  const clearState = () => {
    debugLog('UserContext', 'Clearing all state...');
    
    // Clear all state
    setUserId(null);
    setAccessToken(null);
    setUserName(null);
    setProfileState(null);
    setNutritionalNeeds(null);
    setWaterGlasses(0);
    setMealIntakes({
      breakfast: { protein: 0, fiber: 0 },
      lunch: { protein: 0, fiber: 0 },
      dinner: { protein: 0, fiber: 0 },
    });
    setDailyHistory([]);
    setStreakData(null);
    
    // Clear localStorage
    localStorage.removeItem("lumi_user_id");
    localStorage.removeItem("lumi_access_token");
    localStorage.removeItem("lumi_user_name");
    localStorage.removeItem("lumi_current_screen");
    localStorage.removeItem("lumi_main_tab");
    
    debugLog('UserContext', 'State cleared successfully');
  };

  const logout = async () => {
    // Prevent multiple simultaneous logout calls
    if (isLoggingOut) {
      debugWarn('UserContext', 'Logout already in progress, skipping...');
      return;
    }
    
    setIsLoggingOut(true);
    debugLog('UserContext', 'Starting logout process...');
    
    try {
      // Sign out from Supabase
      await supabase.auth.signOut();
      debugLog('UserContext', 'Supabase signOut completed');
    } catch (error) {
      debugError('UserContext', 'Error during Supabase signOut:', error);
    }
    
    // Clear all state regardless of Supabase signOut result
    clearState();
    
    debugLog('UserContext', 'Logout completed successfully');
    setIsLoggingOut(false);
  };

  // Restore auth from localStorage and validate session with Supabase
  useEffect(() => {
    const restoreSession = async () => {
      debugLog('UserContext', 'Checking for active session...');
      
      try {
        // First, check if Supabase has an active session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          debugError('UserContext', 'Session error:', sessionError);
          // Clear invalid session
          clearState();
          return;
        }
        
        if (!session) {
          debugLog('UserContext', 'No active Supabase session found');
          // Clear any stale data from localStorage
          const storedUserId = localStorage.getItem("lumi_user_id");
          if (storedUserId) {
            debugLog('UserContext', 'Clearing stale localStorage data');
            clearState();
          }
          return;
        }
        
        debugLog('UserContext', 'Active session found for user:', session.user.id);
        
        // Extract user info from session
        const validUserId = session.user.id;
        const validToken = session.access_token;
        const validName = session.user.user_metadata?.name || localStorage.getItem("lumi_user_name") || "User";
        
        // Update state with valid session data
        setUserId(validUserId);
        setAccessToken(validToken);
        setUserName(validName);
        
        // Update localStorage with valid data
        localStorage.setItem("lumi_user_id", validUserId);
        localStorage.setItem("lumi_access_token", validToken);
        localStorage.setItem("lumi_user_name", validName);
        
        // Load user profile from server with valid token
        debugLog('UserContext', 'Loading user profile from server...');
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-7e221a31/users/${validUserId}`,
          {
            headers: {
              Authorization: `Bearer ${validToken}`,
            },
          }
        );
        
        debugLog('UserContext', 'Profile fetch response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          debugError('UserContext', 'Profile fetch failed:', errorText);
          
          // If still getting 401, the session might be invalid
          if (response.status === 401) {
            debugError('UserContext', 'Token invalid, clearing session');
            clearState();
            return;
          }
          
          // For 404, user might not have completed profile yet
          if (response.status === 404) {
            debugWarn('UserContext', 'User profile not found, might need to complete onboarding');
            return;
          }
          
          throw new Error(`Failed to fetch profile: ${response.status}`);
        }
        
        const data = await response.json();
        debugLog('UserContext', 'Loaded user data:', data);
        
        if (data.user && data.user.weight && data.user.height && data.user.age) {
          const userProfile: UserProfile = {
            name: data.user.name,
            age: data.user.age,
            gender: data.user.gender,
            weight: data.user.weight,
            height: data.user.height,
            activityLevel: data.user.activityLevel,
          };
          setProfileState(userProfile);
          const needs = calculateNutritionalNeeds(userProfile);
          setNutritionalNeeds(needs);
          debugLog('UserContext', 'Profile and needs set successfully');
        } else {
          debugWarn('UserContext', 'User data incomplete or missing, needs to complete profile');
        }
      } catch (error) {
        debugError('UserContext', 'Error during session restore:', error);
      }
    };
    
    restoreSession();
    
    // Set up auth state change listener
    debugLog('UserContext', 'Setting up auth state listener');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      debugLog('UserContext', 'Auth state changed:', event);
      
      if (event === 'SIGNED_OUT') {
        debugLog('UserContext', 'User signed out event detected, clearing state');
        // Don't call logout() here to avoid infinite loops
        // Just clear the state directly since signOut was already called
        if (!isLoggingOut) {
          clearState();
        }
      } else if (event === 'TOKEN_REFRESHED') {
        debugLog('UserContext', 'Token refreshed, updating access token');
        if (session?.access_token) {
          setAccessToken(session.access_token);
          localStorage.setItem("lumi_access_token", session.access_token);
        }
      } else if (event === 'SIGNED_IN' && session) {
        debugLog('UserContext', 'User signed in via auth state change');
        const validUserId = session.user.id;
        const validToken = session.access_token;
        const validName = session.user.user_metadata?.name || "User";
        
        setUserId(validUserId);
        setAccessToken(validToken);
        setUserName(validName);
        
        localStorage.setItem("lumi_user_id", validUserId);
        localStorage.setItem("lumi_access_token", validToken);
        localStorage.setItem("lumi_user_name", validName);
      }
    });
    
    // Cleanup subscription on unmount
    return () => {
      debugLog('UserContext', 'Cleaning up auth state listener');
      subscription.unsubscribe();
    };
  }, [isLoggingOut]);

  const calculateNutritionalNeeds = (profile: UserProfile): NutritionalNeeds => {
    // Proteína: 1.2g por kg de peso corporal (ajustado por actividad)
    let proteinMultiplier = 1.0;
    if (profile.activityLevel === "light") proteinMultiplier = 1.2;
    if (profile.activityLevel === "moderate") proteinMultiplier = 1.4;
    if (profile.activityLevel === "very") proteinMultiplier = 1.6;

    const dailyProtein = Math.round(profile.weight * proteinMultiplier);

    // Fibra: basado en género y edad
    let dailyFiber = 25;
    if (profile.gender === "male") {
      dailyFiber = profile.age < 50 ? 38 : 30;
    } else {
      dailyFiber = profile.age < 50 ? 25 : 21;
    }

    // Agua: basado en peso (30-35ml por kg, convertido a vasos de 250ml)
    const dailyWaterMl = profile.weight * 33; // 33ml por kg
    const dailyWater = Math.round(dailyWaterMl / 250); // convertir a vasos de 250ml

    return {
      dailyProtein,
      dailyFiber,
      dailyWater,
      proteinPerMeal: Math.round(dailyProtein / 3),
      fiberPerMeal: Math.round(dailyFiber / 3),
    };
  };

  const setProfile = async (newProfile: UserProfile) => {
    if (!userId || !accessToken) {
      console.error("No userId or accessToken available");
      return;
    }

    setProfileState(newProfile);
    const needs = calculateNutritionalNeeds(newProfile);
    setNutritionalNeeds(needs);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-7e221a31/users/profile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            profile: newProfile,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save profile");
      }

      // Refresh data after saving profile
      await refreshData();
    } catch (error) {
      console.error("Error saving profile:", error);
    }
  };

  const addWater = async (glasses: number = 1) => {
    if (!userId || !accessToken) {
      console.error("No userId or accessToken available");
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-7e221a31/hydration/${userId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ glasses }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        debugError('UserContext', 'Failed to add water:', errorText);
        throw new Error("Failed to add water");
      }

      const data = await response.json();
      setWaterGlasses(data.waterGlasses);
      debugLog('UserContext', 'Water added successfully:', data.waterGlasses);
      try {
        await showNotification('Hidratación registrada', {
          body: `¡Has registrado ${glasses} vaso(s) de agua! Llevas ${data.waterGlasses} hoy.`,
          tag: 'hydration-logged',
          data: { url: '/hydration' },
        });
      } catch (e) {
        console.debug('Notification failed after addWater:', e);
      }
    } catch (error) {
      debugError('UserContext', 'Error adding water:', error);
    }
  };

  const updateMealIntake = async (meal: "breakfast" | "lunch" | "dinner", intake: MealIntake) => {
    if (!userId || !accessToken) {
      console.error("No userId or accessToken available");
      return;
    }

    setMealIntakes((prev) => ({
      ...prev,
      [meal]: intake,
    }));

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-7e221a31/nutrition/${userId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            meal: {
              type: meal,
              protein: intake.protein,
              fiber: intake.fiber,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        debugError('UserContext', 'Failed to save meal:', errorText);
        throw new Error("Failed to save meal");
      }

      debugLog('UserContext', 'Meal saved successfully');
      // Refresh data to update streak
      await refreshData();
    } catch (error) {
      debugError('UserContext', 'Error saving meal:', error);
    }
  };

  const getTotalIntake = () => {
    const totalProtein = mealIntakes.breakfast.protein + mealIntakes.lunch.protein + mealIntakes.dinner.protein;
    const totalFiber = mealIntakes.breakfast.fiber + mealIntakes.lunch.fiber + mealIntakes.dinner.fiber;
    return { protein: totalProtein, fiber: totalFiber };
  };

  const refreshData = async () => {
    if (!userId || !accessToken) {
      console.log("refreshData: No userId or accessToken");
      return;
    }

    console.log("refreshData: Starting data refresh for user", userId);

    try {
      // Get today's summary (includes streak data)
      const summaryResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-7e221a31/summary/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (summaryResponse.ok) {
        const summary = await summaryResponse.json();
        console.log("refreshData: Summary data received", summary);
        
        // Update streak data
        if (summary.streak) {
          setStreakData(summary.streak);
          console.log("refreshData: Streak data set", summary.streak);
        }
        
        if (summary.daily) {
          setWaterGlasses(summary.daily.waterGlasses || 0);
          console.log("refreshData: Water glasses set", summary.daily.waterGlasses || 0);
          
          // Reconstruct meal intakes from meals array
          const meals = summary.daily.meals || [];
          const newMealIntakes = {
            breakfast: { protein: 0, fiber: 0 },
            lunch: { protein: 0, fiber: 0 },
            dinner: { protein: 0, fiber: 0 },
          };

          meals.forEach((meal: any) => {
            if (meal.type && newMealIntakes[meal.type as keyof typeof newMealIntakes]) {
              newMealIntakes[meal.type as keyof typeof newMealIntakes] = {
                protein: meal.protein || 0,
                fiber: meal.fiber || 0,
              };
            }
          });

          setMealIntakes(newMealIntakes);
          console.log("refreshData: Meal intakes set", newMealIntakes);
        }
      } else {
        console.log("refreshData: Summary response not ok", summaryResponse.status);
      }

      // Get history
      const historyResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-7e221a31/hydration/${userId}?days=14`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        const history = historyData.history || [];
        
        // Convert to DailyProgress format
        const formattedHistory: DailyProgress[] = history.map((day: any) => {
          const proteinMet = nutritionalNeeds ? day.totalProtein >= nutritionalNeeds.dailyProtein * 0.8 : false;
          const fiberMet = nutritionalNeeds ? day.totalFiber >= nutritionalNeeds.dailyFiber * 0.8 : false;
          
          return {
            date: day.date,
            isBalanced: proteinMet && fiberMet,
            waterGlasses: day.waterGlasses || 0,
            totalProtein: day.totalProtein || 0,
            totalFiber: day.totalFiber || 0,
          };
        });

        setDailyHistory(formattedHistory);
      }
    } catch (error) {
      console.error("Error refreshing data:", error);
    }
  };

  // Load data when userId, accessToken, and nutritionalNeeds are available
  useEffect(() => {
    console.log("Data refresh effect triggered", { userId: !!userId, accessToken: !!accessToken, nutritionalNeeds: !!nutritionalNeeds });
    if (userId && accessToken && nutritionalNeeds) {
      console.log("Calling refreshData...");
      refreshData();
    }
  }, [nutritionalNeeds]); // Only trigger when nutritionalNeeds changes

  const checkAndUpdateDailyProgress = () => {
    if (!nutritionalNeeds) return;
    
    const totalIntake = getTotalIntake();
    const proteinMet = totalIntake.protein >= nutritionalNeeds.dailyProtein * 0.8; // 80% threshold
    const fiberMet = totalIntake.fiber >= nutritionalNeeds.dailyFiber * 0.8;
    
    const isBalanced = proteinMet && fiberMet;
    return isBalanced;
  };

  return (
    <UserContext.Provider
      value={{
        userId,
        accessToken,
        userName,
        profile,
        nutritionalNeeds,
        setAuth,
        setProfile,
        setUserProfile: setProfile,
        mealIntakes,
        updateMealIntake,
        getTotalIntake,
        waterGlasses,
        addWater,
        dailyHistory,
        streakData,
        checkAndUpdateDailyProgress,
        refreshData,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
