import React from 'react';
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from 'framer-motion';
import { AuthScreen } from "./pages/AuthScreen";
import { OnboardingFlow } from "./pages/OnboardingFlow";
import { ProfileSetupScreen } from "./pages/ProfileSetupScreen";
import { BluetoothScreen } from "./pages/BluetoothScreen";
import { DashboardScreen } from "./pages/DashboardScreen";
import { NutritionScreen } from "./pages/NutritionScreen";
import { ProfileScreen } from "./pages/ProfileScreen";
import { HydrationAlertScreen } from "./pages/HydrationAlertScreen";
import { Home, Apple, User } from "lucide-react";
import { UserProvider, useUser } from "./contexts/UserContext";
import { BluetoothProvider } from "./contexts/BluetoothContext";
import { initPWAInstallPrompt } from "./utils/pwa";
import NotificationPermissionPrompt from "./components/NotificationPermissionPrompt";

type Screen = "auth" | "onboarding" | "profile" | "bluetooth" | "dashboard" | "nutrition" | "userprofile" | "hydration-alert";
type MainTab = "dashboard" | "nutrition" | "userprofile";

function AppContent() {
  const { userId, setAuth, profile } = useUser();
  const [currentScreen, setCurrentScreen] = useState<Screen>(() => {
    // Initialize with persisted state or default
    if (userId) {
      const saved = localStorage.getItem("lumi_current_screen");
      return (saved as Screen) || "dashboard";
    }
    return "auth";
  });
  const [mainTab, setMainTab] = useState<MainTab>(() => {
    const saved = localStorage.getItem("lumi_main_tab");
    return (saved as MainTab) || "dashboard";
  });
  const [showHydrationAlert, setShowHydrationAlert] = useState(false);

  // Handle logout
  const handleLogout = async () => {
    setCurrentScreen("auth");
    setMainTab("dashboard");
    localStorage.removeItem("lumi_current_screen");
    localStorage.removeItem("lumi_main_tab");
  };

  // Show loading screen while checking session
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  
  useEffect(() => {
    // Small delay to check if user session exists
    const timer = setTimeout(() => {
      setIsCheckingSession(false);
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  // Auto-navigate to dashboard when user is logged in with profile
  useEffect(() => {
    if (userId && profile && currentScreen === "auth") {
      setCurrentScreen("dashboard");
    }
  }, [userId, profile]);

  // Persist current screen
  useEffect(() => {
    if (userId && currentScreen !== "auth") {
      localStorage.setItem("lumi_current_screen", currentScreen);
    }
  }, [currentScreen, userId]);

  // Persist main tab
  useEffect(() => {
    if (userId) {
      localStorage.setItem("lumi_main_tab", mainTab);
    }
  }, [mainTab, userId]);

  if (isCheckingSession && userId) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <motion.div
            className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-yellow-300 to-amber-400 rounded-full flex items-center justify-center shadow-xl"
            animate={{
              scale: [1, 1.1, 1],
              rotate: [0, 360],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <div className="text-4xl">✨</div>
          </motion.div>
          <p className="text-gray-600">Cargando Lumi...</p>
        </motion.div>
      </div>
    );
  }

  const handleNext = (nextScreen: Screen) => {
    setCurrentScreen(nextScreen);
  };

  const handleTabChange = (tab: MainTab) => {
    setMainTab(tab);
  };

  const handleAuthSuccess = (userId: string, accessToken: string, name: string, hasProfile: boolean) => {
    setAuth(userId, accessToken, name);
    // If user has profile, go directly to dashboard
    // Otherwise, show onboarding flow
    setCurrentScreen(hasProfile ? "dashboard" : "onboarding");
  };

  // Screen variants for animations
  const screenVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? "100%" : "-100%",
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? "-100%" : "100%",
      opacity: 0,
    }),
  };

  const handleDismissHydrationAlert = () => {
    setShowHydrationAlert(false);
  };

  const handleSnoozeHydrationAlert = () => {
    setShowHydrationAlert(false);
    // Simular que la alarma volverá a sonar en 10 minutos
    setTimeout(() => {
      setShowHydrationAlert(true);
    }, 600000); // 10 minutos en milisegundos
  };

  const renderCurrentScreen = () => {
    // Hydration alert overlay - highest priority
    if (showHydrationAlert) {
      return (
        <HydrationAlertScreen
          onDismiss={handleDismissHydrationAlert}
          onSnooze={handleSnoozeHydrationAlert}
        />
      );
    }

    // Auth screen
    if (currentScreen === "auth") {
      return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
    }
    
    // Onboarding flow
    if (currentScreen === "onboarding") {
      return <OnboardingFlow onComplete={() => handleNext("profile")} />;
    }
    if (currentScreen === "profile") {
      return <ProfileSetupScreen onNext={() => handleNext("bluetooth")} />;
    }
    if (currentScreen === "bluetooth") {
      return <BluetoothScreen onNext={() => handleNext("dashboard")} />;
    }

    // Main app with tabs
    if (currentScreen === "dashboard") {
      if (mainTab === "dashboard") return <DashboardScreen />;
      if (mainTab === "nutrition") return <NutritionScreen />;
      if (mainTab === "userprofile") return (
        <ProfileScreen 
          onReconnectBluetooth={() => setCurrentScreen("bluetooth")} 
          onLogout={handleLogout}
        />
      );
    }

    return <DashboardScreen />;
  };

  const isMainApp = currentScreen === "dashboard" && !showHydrationAlert;

  return (
    <div className="h-screen w-screen overflow-hidden bg-white">
      <NotificationPermissionPrompt />
      {/* Main screen container */}
      <div className="relative w-full h-full">
        <AnimatePresence mode="wait" custom={1}>
          <motion.div
            key={currentScreen + mainTab + (showHydrationAlert ? "alert" : "")}
            custom={1}
            variants={screenVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="absolute inset-0"
          >
            {renderCurrentScreen()}
          </motion.div>
        </AnimatePresence>

        {/* Bottom navigation - only show in main app */}
        {isMainApp && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, type: "spring" }}
            className="fixed bottom-0 left-0 right-0 z-50 nav-container bg-white/80 backdrop-blur-xl border-t border-gray-200"
          >
            <div className="flex items-center justify-around max-w-md mx-auto px-6 py-3">
              {/* Dashboard tab */}
              <motion.button
                onClick={() => handleTabChange("dashboard")}
                className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${
                  mainTab === "dashboard" ? "bg-blue-100" : ""
                }`}
                whileTap={{ scale: 0.95 }}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    mainTab === "dashboard"
                      ? "bg-gradient-to-br from-blue-400 to-purple-500"
                      : "bg-gray-100"
                  }`}
                >
                  <Home
                    className={`w-5 h-5 ${
                      mainTab === "dashboard" ? "text-white" : "text-gray-400"
                    }`}
                  />
                </div>
                <span
                  className={`text-xs ${
                    mainTab === "dashboard" ? "text-blue-600" : "text-gray-400"
                  }`}
                >
                  Home
                </span>
              </motion.button>

              {/* Nutrition tab */}
              <motion.button
                onClick={() => handleTabChange("nutrition")}
                className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${
                  mainTab === "nutrition" ? "bg-pink-100" : ""
                }`}
                whileTap={{ scale: 0.95 }}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    mainTab === "nutrition"
                      ? "bg-gradient-to-br from-pink-400 to-green-500"
                      : "bg-gray-100"
                  }`}
                >
                  <Apple
                    className={`w-5 h-5 ${
                      mainTab === "nutrition" ? "text-white" : "text-gray-400"
                    }`}
                  />
                </div>
                <span
                  className={`text-xs ${
                    mainTab === "nutrition" ? "text-pink-600" : "text-gray-400"
                  }`}
                >
                  Meals
                </span>
              </motion.button>

              {/* Profile tab */}
              <motion.button
                onClick={() => handleTabChange("userprofile")}
                className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${
                  mainTab === "userprofile" ? "bg-purple-100" : ""
                }`}
                whileTap={{ scale: 0.95 }}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    mainTab === "userprofile"
                      ? "bg-gradient-to-br from-purple-400 to-pink-500"
                      : "bg-gray-100"
                  }`}
                >
                  <User
                    className={`w-5 h-5 ${
                      mainTab === "userprofile" ? "text-white" : "text-gray-400"
                    }`}
                  />
                </div>
                <span
                  className={`text-xs ${
                    mainTab === "userprofile" ? "text-purple-600" : "text-gray-400"
                  }`}
                >
                  Profile
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    // Service worker registration disabled (server-side push). Initialize
    // install prompt only.
    initPWAInstallPrompt((canInstall) => {
      if (canInstall) {
        console.log('✨ Lumi can be installed as a PWA!');
      }
    });
  }, []);

  return (
    <UserProvider>
      <BluetoothProvider>
        <AppContent />
      </BluetoothProvider>
    </UserProvider>
  );
}
