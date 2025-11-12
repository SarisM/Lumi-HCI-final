import { motion } from "motion/react";
import { Droplet, Sun, Flower2, Plus, Flame, Bluetooth, Check, X } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { Button } from "../components/ui/button";
import { useState, useEffect } from "react";
import { logUserEvent } from "../utils/analytics";
import { useArduinoAlarms } from "../utils/useArduinoAlarms";
import { useBluetooth } from "../contexts/BluetoothContext";

export function DashboardScreen() {
  const { nutritionalNeeds, waterGlasses, addWater, getTotalIntake, mealIntakes, streakData, userName, userId, accessToken, profile } = useUser();
  const [isAddingWater, setIsAddingWater] = useState(false);

  const totalIntake = getTotalIntake();

  // Activar sistema de alarmas de Arduino
  useArduinoAlarms({
    waterGlasses,
    dailyWaterGoal: nutritionalNeeds?.dailyWater || 8,
    totalProtein: totalIntake.protein,
    totalFiber: totalIntake.fiber,
    dailyProteinGoal: nutritionalNeeds?.dailyProtein || 60,
    dailyFiberGoal: nutritionalNeeds?.dailyFiber || 25,
    dayStartTime: profile?.dayStartTime || "07:00",
    dayEndTime: profile?.dayEndTime || "22:00",
    lastMealBalanced: false, // Se puede calcular basado en la última comida
  });
  
  // Debug logging
  useEffect(() => {
    console.log("DashboardScreen:", {
      nutritionalNeeds,
      waterGlasses,
      totalIntake,
      mealIntakes,
      streakData
    });
  }, [nutritionalNeeds, waterGlasses, totalIntake, mealIntakes, streakData]);
  
  // Calculate percentages
  const waterPercentage = nutritionalNeeds 
    ? Math.round((waterGlasses / nutritionalNeeds.dailyWater) * 100) 
    : 0;
  
  const proteinPercentage = nutritionalNeeds 
    ? Math.round((totalIntake.protein / nutritionalNeeds.dailyProtein) * 100) 
    : 0;
  
  const fiberPercentage = nutritionalNeeds 
    ? Math.round((totalIntake.fiber / nutritionalNeeds.dailyFiber) * 100) 
    : 0;

  const nutritionPercentage = Math.round((proteinPercentage + fiberPercentage) / 2);

  // Calculate total balance
  const totalBalance = Math.round((waterPercentage + nutritionPercentage) / 2);

  // Determine Lumi color based on status
  const getLumiColor = () => {
    const waterMet = waterPercentage >= 80;
    const proteinMet = proteinPercentage >= 80;
    const fiberMet = fiberPercentage >= 80;

    // Amarillo pastel - todo perfecto
    if (waterMet && proteinMet && fiberMet) {
      return {
        gradient: "linear-gradient(135deg, #FEF3C7, #FDE68A)",
        shadow: "rgba(254, 243, 199, 0.7)",
        message: "¡Estás brillando! ✨",
      };
    }

    // Verde - nutrición balanceada
    if (proteinMet && fiberMet) {
      return {
        gradient: "linear-gradient(135deg, #D1FAE5, #86EFAC)",
        shadow: "rgba(209, 250, 229, 0.7)",
        message: "¡Súper nutritivo! 🌸",
      };
    }

    // Azul - necesita hidratación
    if (!waterMet) {
      return {
        gradient: "linear-gradient(135deg, #DBEAFE, #93C5FD)",
        shadow: "rgba(219, 234, 254, 0.7)",
        message: "¡Dale aguita! 💧",
      };
    }

    // Naranja - falta nutrición
    return {
      gradient: "linear-gradient(135deg, #FED7AA, #FDBA74)",
      shadow: "rgba(254, 215, 170, 0.7)",
      message: "¡A comer rico! 🍽️",
    };
  };

  const lumiStatus = getLumiColor();

  const handleAddWater = async () => {
    setIsAddingWater(true);
    await addWater(1);
    
    // Log hydration event (fire-and-forget to avoid blocking UI and to tolerate network failures/adblockers)
    if (userId && accessToken) {
      void logUserEvent(userId, accessToken, "hydration_logged", {
        glasses: 1,
        totalGlasses: waterGlasses + 1,
        percentage: nutritionalNeeds 
          ? Math.round(((waterGlasses + 1) / nutritionalNeeds.dailyWater) * 100)
          : 0,
      });
    }
    
    setTimeout(() => setIsAddingWater(false), 300);
  };

  // Count balanced meals
  const balancedMealsCount = Object.values(mealIntakes).filter(meal => {
    if (!nutritionalNeeds) return false;
    const proteinOk = meal.protein >= nutritionalNeeds.proteinPerMeal * 0.8;
    const fiberOk = meal.fiber >= nutritionalNeeds.fiberPerMeal * 0.8;
    return proteinOk && fiberOk;
  }).length;

  const { isConnected, deviceName } = useBluetooth();

  return (
    <div className="relative h-full bg-gradient-to-br from-blue-50 via-yellow-50 to-green-50 overflow-y-auto pb-24">
      <div className="p-6">
        {/* Background ambiance */}
        <motion.div
          className="absolute top-20 right-10 w-40 h-40 bg-yellow-300/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.3, 1],
            x: [0, 20, 0],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
          }}
        />

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Balance de hoy</p>
            <h2 className="text-gray-800">{lumiStatus.message}</h2>
          </div>
          {/* Bluetooth status chip */}
          <div className="flex items-center gap-2">
            <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 shadow ${isConnected ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-gray-50 text-gray-700 border border-gray-100'}`}>
              {isConnected ? <Check className="w-4 h-4 text-green-600" /> : <Bluetooth className="w-4 h-4 text-gray-500" />}
              <span>{isConnected ? `Conectado: ${deviceName || 'Lumi'}` : 'Sin conexión'}</span>
            </div>
          </div>
        </div>

        {/* Central Lumi ring - real-time color */}
        <div className="flex items-center justify-center mb-8">
          <div className="relative">
            {/* Outer pulse */}
            <motion.div
              className="absolute inset-0 w-48 h-48 -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2 rounded-full"
              style={{
                background: `radial-gradient(circle, ${lumiStatus.shadow} 0%, transparent 70%)`,
              }}
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* Main ring */}
            <div className="relative w-48 h-48 bg-white/80 backdrop-blur-xl rounded-full shadow-2xl flex items-center justify-center border-4 border-white/50">
              {/* Gradient ring */}
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#93C5FD" />
                    <stop offset="50%" stopColor="#FDE68A" />
                    <stop offset="100%" stopColor="#86EFAC" />
                  </linearGradient>
                </defs>
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="4"
                  strokeDasharray="283"
                  strokeDashoffset={283 - (283 * Math.min(totalBalance, 100)) / 100}
                  strokeLinecap="round"
                />
              </svg>

              {/* Center glow */}
              <motion.div
                className="w-32 h-32 rounded-full flex items-center justify-center"
                style={{
                  background: lumiStatus.gradient,
                }}
                animate={{
                  boxShadow: [
                    `0 0 20px ${lumiStatus.shadow}`,
                    `0 0 40px ${lumiStatus.shadow}`,
                    `0 0 20px ${lumiStatus.shadow}`,
                  ],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                }}
              >
                <span className="text-white text-2xl">{Math.min(totalBalance, 100)}%</span>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Habit cards */}
        <div className="space-y-3 flex-1">
          {/* Hydration card - Enhanced with water fill effect */}
          <motion.div
            className="bg-white/70 backdrop-blur-xl rounded-3xl p-5 border border-white/50 shadow-lg relative overflow-hidden"
            whileHover={{ scale: 1.02, y: -2 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="flex items-start justify-between mb-4 relative z-10">
              <div className="flex items-center gap-3">
                <motion.div 
                  className="w-14 h-14 bg-gradient-to-br from-blue-200 to-blue-300 rounded-2xl flex items-center justify-center shadow-lg"
                  animate={{
                    rotate: [0, 5, -5, 0],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                  }}
                >
                  <Droplet className="w-7 h-7 text-blue-600" fill="currentColor" />
                </motion.div>
                <div>
                  <p className="text-gray-800">Hidratación 💧</p>
                  <p className="text-xs text-gray-500">
                    {waterGlasses} de {nutritionalNeeds?.dailyWater || 8} vasos
                  </p>
                </div>
              </div>
              <motion.div
                whileTap={{ scale: 0.9 }}
                animate={isAddingWater ? { scale: [1, 1.2, 1] } : {}}
              >
                <Button
                  size="sm"
                  className="h-10 w-10 p-0 rounded-full bg-gradient-to-br from-blue-300 to-blue-400 hover:from-blue-400 hover:to-blue-500 shadow-lg text-blue-900"
                  onClick={handleAddWater}
                >
                  <Plus className="w-5 h-5" />
                </Button>
              </motion.div>
            </div>

            {/* Water container with fill effect */}
            <div className="relative h-32 bg-gradient-to-b from-blue-50 to-blue-100 rounded-2xl overflow-hidden border-2 border-blue-200/50">
              {/* Water fill with realistic wave animation */}
              <motion.div
                className="absolute inset-x-0 bottom-0"
                initial={{ height: 0 }}
                animate={{ 
                  height: `${Math.min(waterPercentage, 100)}%`,
                }}
                transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
              >
                {/* Base water layer with gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-blue-300 via-blue-200 to-cyan-100" />
                
                {/* Shimmer effect */}
                <motion.div
                  className="absolute inset-0 opacity-30"
                  style={{
                    background: "linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)",
                    backgroundSize: "200% 200%",
                  }}
                  animate={{
                    backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />

                {/* Realistic SVG water waves */}
                <svg
                  className="absolute inset-x-0 top-0 w-full"
                  style={{ height: "40px", marginTop: "-20px" }}
                  preserveAspectRatio="none"
                  viewBox="0 0 400 40"
                >
                  <defs>
                    <linearGradient id="waveGradient1" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgba(147, 197, 253, 0.8)" />
                      <stop offset="100%" stopColor="rgba(59, 130, 246, 0.3)" />
                    </linearGradient>
                    <linearGradient id="waveGradient2" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgba(191, 219, 254, 0.6)" />
                      <stop offset="100%" stopColor="rgba(96, 165, 250, 0.2)" />
                    </linearGradient>
                  </defs>
                  
                  {/* First wave layer */}
                  <motion.path
                    d="M0,20 Q100,10 200,20 T400,20 V40 H0 Z"
                    fill="url(#waveGradient1)"
                    animate={{
                      d: [
                        "M0,20 Q100,10 200,20 T400,20 V40 H0 Z",
                        "M0,20 Q100,30 200,20 T400,20 V40 H0 Z",
                        "M0,20 Q100,10 200,20 T400,20 V40 H0 Z",
                      ],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  
                  {/* Second wave layer */}
                  <motion.path
                    d="M0,25 Q100,15 200,25 T400,25 V40 H0 Z"
                    fill="url(#waveGradient2)"
                    animate={{
                      d: [
                        "M0,25 Q100,15 200,25 T400,25 V40 H0 Z",
                        "M0,25 Q100,35 200,25 T400,25 V40 H0 Z",
                        "M0,25 Q100,15 200,25 T400,25 V40 H0 Z",
                      ],
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 0.5,
                    }}
                  />
                  
                  {/* Third wave layer - subtle */}
                  <motion.path
                    d="M0,22 Q50,18 100,22 T200,22 T400,22 V40 H0 Z"
                    fill="rgba(255, 255, 255, 0.15)"
                    animate={{
                      d: [
                        "M0,22 Q50,18 100,22 T200,22 T400,22 V40 H0 Z",
                        "M0,22 Q50,26 100,22 T200,22 T400,22 V40 H0 Z",
                        "M0,22 Q50,18 100,22 T200,22 T400,22 V40 H0 Z",
                      ],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 1,
                    }}
                  />
                </svg>

                {/* Animated water bubbles */}
                {waterPercentage > 0 && (
                  <>
                    <motion.div
                      className="absolute w-2 h-2 bg-white/50 rounded-full blur-[1px]"
                      style={{ left: "15%", bottom: "25%" }}
                      animate={{
                        y: [-30, -60],
                        x: [-5, 5, -5],
                        opacity: [0, 0.8, 0],
                        scale: [0.8, 1, 0.6],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        delay: 0.3,
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="absolute w-3 h-3 bg-white/40 rounded-full blur-[1px]"
                      style={{ left: "45%", bottom: "15%" }}
                      animate={{
                        y: [-25, -55],
                        x: [3, -3, 3],
                        opacity: [0, 0.7, 0],
                        scale: [0.7, 1, 0.5],
                      }}
                      transition={{
                        duration: 3.5,
                        repeat: Infinity,
                        delay: 0.8,
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="absolute w-1.5 h-1.5 bg-white/60 rounded-full blur-[0.5px]"
                      style={{ left: "70%", bottom: "35%" }}
                      animate={{
                        y: [-20, -45],
                        x: [-3, 3, -3],
                        opacity: [0, 0.9, 0],
                        scale: [0.9, 1, 0.7],
                      }}
                      transition={{
                        duration: 2.8,
                        repeat: Infinity,
                        delay: 0.1,
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="absolute w-2.5 h-2.5 bg-white/35 rounded-full blur-[1px]"
                      style={{ left: "85%", bottom: "20%" }}
                      animate={{
                        y: [-28, -58],
                        x: [4, -4, 4],
                        opacity: [0, 0.6, 0],
                        scale: [0.6, 1, 0.4],
                      }}
                      transition={{
                        duration: 3.2,
                        repeat: Infinity,
                        delay: 1.2,
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="absolute w-1 h-1 bg-white/70 rounded-full blur-[0.5px]"
                      style={{ left: "28%", bottom: "40%" }}
                      animate={{
                        y: [-18, -38],
                        x: [2, -2, 2],
                        opacity: [0, 1, 0],
                        scale: [1, 1, 0.8],
                      }}
                      transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        delay: 1.5,
                        ease: "easeInOut",
                      }}
                    />
                  </>
                )}

                {/* Light reflections */}
                <motion.div
                  className="absolute inset-0 opacity-20"
                  style={{
                    background: "radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.6) 0%, transparent 50%)",
                  }}
                  animate={{
                    opacity: [0.2, 0.4, 0.2],
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </motion.div>

              {/* Percentage indicator */}
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <motion.div
                  className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5, type: "spring" }}
                >
                  <span className="text-2xl text-blue-600">{waterPercentage}%</span>
                </motion.div>
              </div>

              {/* Glass markings */}
              {[...Array(nutritionalNeeds?.dailyWater || 8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-blue-200/30"
                  style={{
                    bottom: `${((i + 1) / (nutritionalNeeds?.dailyWater || 8)) * 100}%`,
                  }}
                >
                  <span className="absolute right-2 -top-2 text-[10px] text-blue-400/60">
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>

            {/* Fun message */}
            <motion.p
              className="mt-3 text-xs text-center text-blue-600"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              {waterPercentage >= 100 && "✨ ¡Eres una leyenda del H₂O! Hidratación nivel pro"}
              {waterPercentage >= 80 && waterPercentage < 100 && "🌊 ¡Ya merito! Un vasito más y eres imparable"}
              {waterPercentage >= 50 && waterPercentage < 80 && "💙 ¡Vas súper bien! Keep it up, bebe agua"}
              {waterPercentage < 50 && "🐠 Tu cuerpo te pide aguita, ¡dale amor líquido!"}
            </motion.p>
          </motion.div>

          {/* Nutrition card */}
          <motion.div
            className="bg-white/70 backdrop-blur-xl rounded-2xl p-4 border border-white/50 shadow-lg"
            whileHover={{ scale: 1.02, y: -2 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-green-200 to-green-300 rounded-2xl flex items-center justify-center shadow-md">
                  <motion.div
                    animate={{
                      rotate: [0, 5, -5, 0],
                      scale: [1, 1.05, 1],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                    }}
                  >
                    <Flower2 className="w-6 h-6 text-green-700" />
                  </motion.div>
                </div>
                <div>
                  <p className="text-gray-800">Nutrición</p>
                  <p className="text-xs text-gray-500">{balancedMealsCount} comidas balanceadas</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-green-600">{nutritionPercentage}%</p>
              </div>
            </div>
            <div className="relative h-2 bg-green-100 rounded-full overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-300 to-green-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(nutritionPercentage, 100)}%` }}
                transition={{ duration: 1, delay: 0.4 }}
              />
            </div>

            {/* Mini breakdown */}
            <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 gap-2">
              <div className="text-xs">
                <span className="text-gray-500">Proteína: </span>
                <span className="text-gray-700">
                  {totalIntake.protein}g / {nutritionalNeeds?.dailyProtein || 0}g
                </span>
              </div>
              <div className="text-xs">
                <span className="text-gray-500">Fibra: </span>
                <span className="text-gray-700">
                  {totalIntake.fiber}g / {nutritionalNeeds?.dailyFiber || 0}g
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Quick tip */}
        <motion.div
          className="mt-4 bg-gradient-to-r from-purple-100 to-pink-100 rounded-2xl p-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <p className="text-xs text-purple-700 text-center">
            ✨ Pro tip: Ve a Meals y registra tus comidas para trackear tu glow-up completo
          </p>
        </motion.div>
      </div>
    </div>
  );
}
