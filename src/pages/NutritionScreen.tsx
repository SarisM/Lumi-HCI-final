import { motion } from "motion/react";
import { Coffee, Sun as SunIcon, Moon, Check, Plus, Minus } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { Slider } from "../components/ui/slider";
import { Button } from "../components/ui/button";
import { logUserEvent } from "../utils/analytics";

export function NutritionScreen() {
  const { nutritionalNeeds, mealIntakes, updateMealIntake, getTotalIntake, userId, accessToken } = useUser();

  if (!nutritionalNeeds) {
    return (
      <div className="relative h-full bg-gradient-to-br from-pink-50 via-green-50 to-yellow-50 overflow-hidden p-6 flex items-center justify-center">
        <p className="text-gray-500 text-center">
          Por favor completa tu perfil primero
        </p>
      </div>
    );
  }

  const totalIntake = getTotalIntake();
  const proteinProgress = (totalIntake.protein / nutritionalNeeds.dailyProtein) * 100;
  const fiberProgress = (totalIntake.fiber / nutritionalNeeds.dailyFiber) * 100;

  // Calculate flower bloom based on overall balance
  const totalPetals = 6;
  const proteinMeals = [
    mealIntakes.breakfast.protein >= nutritionalNeeds.proteinPerMeal,
    mealIntakes.lunch.protein >= nutritionalNeeds.proteinPerMeal,
    mealIntakes.dinner.protein >= nutritionalNeeds.proteinPerMeal,
  ];
  const fiberMeals = [
    mealIntakes.breakfast.fiber >= nutritionalNeeds.fiberPerMeal,
    mealIntakes.lunch.fiber >= nutritionalNeeds.fiberPerMeal,
    mealIntakes.dinner.fiber >= nutritionalNeeds.fiberPerMeal,
  ];
  const completedPetals = [...proteinMeals, ...fiberMeals].filter(Boolean).length;

  const updateProtein = async (meal: "breakfast" | "lunch" | "dinner", value: number) => {
    updateMealIntake(meal, { ...mealIntakes[meal], protein: value });
    
    // Log meal event (non-blocking)
    if (userId && accessToken) {
      const mealData = { ...mealIntakes[meal], protein: value };
      const isBalanced = mealData.protein >= nutritionalNeeds.proteinPerMeal && 
                        mealData.fiber >= nutritionalNeeds.fiberPerMeal;

      void logUserEvent(userId, accessToken, "meal_logged", {
        meal,
        protein: value,
        fiber: mealData.fiber,
        isBalanced,
      });
    }
  };

  const updateFiber = async (meal: "breakfast" | "lunch" | "dinner", value: number) => {
    updateMealIntake(meal, { ...mealIntakes[meal], fiber: value });
    
    // Log meal event (non-blocking)
    if (userId && accessToken) {
      const mealData = { ...mealIntakes[meal], fiber: value };
      const isBalanced = mealData.protein >= nutritionalNeeds.proteinPerMeal && 
                        mealData.fiber >= nutritionalNeeds.fiberPerMeal;

      void logUserEvent(userId, accessToken, "meal_logged", {
        meal,
        protein: mealData.protein,
        fiber: value,
        isBalanced,
      });
    }
  };

  return (
    <div className="relative h-full flex flex-col">
      <div className="flex-1 bg-gradient-to-br from-pink-50 via-green-50 to-yellow-50 overflow-y-auto pb-24">
        {/* Background elements */}
        <motion.div
          className="absolute top-1/4 left-10 w-32 h-32 bg-pink-300/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
          }}
        />

        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="mb-4">
            <h2 className="text-gray-800 mb-1">Daily Nutrition</h2>
            <p className="text-sm text-gray-500">Track your luminous meals</p>
          </div>

          {/* Daily summary */}
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-4 border border-white/50 mb-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Proteína diaria</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg text-blue-600">{totalIntake.protein}g</span>
                  <span className="text-xs text-gray-400">/ {nutritionalNeeds.dailyProtein}g</span>
                </div>
                <div className="relative h-2 bg-blue-100 rounded-full overflow-hidden mt-2">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(proteinProgress, 100)}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Fibra diaria</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg text-green-600">{totalIntake.fiber}g</span>
                  <span className="text-xs text-gray-400">/ {nutritionalNeeds.dailyFiber}g</span>
                </div>
                <div className="relative h-2 bg-green-100 rounded-full overflow-hidden mt-2">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-400 to-green-600 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(fiberProgress, 100)}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Meal entries */}
          <div className="flex-1 overflow-auto space-y-3 mb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {/* Breakfast */}
            <MealCard
              title="Breakfast"
              icon={<Coffee className="w-5 h-5 text-white" />}
              gradientFrom="from-orange-400"
              gradientTo="to-yellow-400"
              protein={mealIntakes.breakfast.protein}
              fiber={mealIntakes.breakfast.fiber}
              proteinGoal={nutritionalNeeds.proteinPerMeal}
              fiberGoal={nutritionalNeeds.fiberPerMeal}
              onProteinChange={(value) => updateProtein("breakfast", value)}
              onFiberChange={(value) => updateFiber("breakfast", value)}
              isComplete={
                mealIntakes.breakfast.protein >= nutritionalNeeds.proteinPerMeal &&
                mealIntakes.breakfast.fiber >= nutritionalNeeds.fiberPerMeal
              }
            />

            {/* Lunch */}
            <MealCard
              title="Lunch"
              icon={<SunIcon className="w-5 h-5 text-white" />}
              gradientFrom="from-yellow-400"
              gradientTo="to-amber-400"
              protein={mealIntakes.lunch.protein}
              fiber={mealIntakes.lunch.fiber}
              proteinGoal={nutritionalNeeds.proteinPerMeal}
              fiberGoal={nutritionalNeeds.fiberPerMeal}
              onProteinChange={(value) => updateProtein("lunch", value)}
              onFiberChange={(value) => updateFiber("lunch", value)}
              isComplete={
                mealIntakes.lunch.protein >= nutritionalNeeds.proteinPerMeal &&
                mealIntakes.lunch.fiber >= nutritionalNeeds.fiberPerMeal
              }
            />

            {/* Dinner */}
            <MealCard
              title="Dinner"
              icon={<Moon className="w-5 h-5 text-white" />}
              gradientFrom="from-indigo-400"
              gradientTo="to-purple-400"
              protein={mealIntakes.dinner.protein}
              fiber={mealIntakes.dinner.fiber}
              proteinGoal={nutritionalNeeds.proteinPerMeal}
              fiberGoal={nutritionalNeeds.fiberPerMeal}
              onProteinChange={(value) => updateProtein("dinner", value)}
              onFiberChange={(value) => updateFiber("dinner", value)}
              isComplete={
                mealIntakes.dinner.protein >= nutritionalNeeds.proteinPerMeal &&
                mealIntakes.dinner.fiber >= nutritionalNeeds.fiberPerMeal
              }
            />
          </div>

          {/* Blooming flower visualization */}
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-4 border border-white/50">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">Balance de hoy</p>
                <div className="relative w-20 h-20">
                  {/* Center */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      className="w-6 h-6 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-full"
                      animate={{
                        scale: [1, 1.1, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                      }}
                    />
                  </div>

                  {/* Petals */}
                  {[0, 1, 2, 3, 4, 5].map((index) => {
                    const angle = (index * 60 * Math.PI) / 180;
                    const isActive = index < completedPetals;

                    return (
                      <motion.div
                        key={index}
                        className="absolute top-1/2 left-1/2"
                        style={{
                          originX: "0px",
                          originY: "0px",
                        }}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{
                          scale: isActive ? 1 : 0.3,
                          opacity: isActive ? 1 : 0.2,
                          x: Math.cos(angle) * 30,
                          y: Math.sin(angle) * 30,
                        }}
                        transition={{
                          duration: 0.5,
                          delay: index * 0.1,
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-full"
                          style={{
                            background: isActive
                              ? "linear-gradient(135deg, #F472B6, #EC4899)"
                              : "linear-gradient(135deg, #E5E7EB, #D1D5DB)",
                          }}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              <div className="text-center">
                <motion.p
                  className="text-sm text-gray-600 mb-1"
                  animate={{
                    opacity: [0.7, 1, 0.7],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                  }}
                >
                  {completedPetals === 6
                    ? "¡Perfecto equilibrio! 🌸"
                    : "Cada comida balanceada ayuda a crecer tu luz"}
                </motion.p>
                <p className="text-xs text-gray-400">
                  {Math.round((completedPetals / totalPetals) * 100)}% florecido
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MealCardProps {
  title: string;
  icon: React.ReactNode;
  gradientFrom: string;
  gradientTo: string;
  protein: number;
  fiber: number;
  proteinGoal: number;
  fiberGoal: number;
  onProteinChange: (value: number) => void;
  onFiberChange: (value: number) => void;
  isComplete: boolean;
}

function MealCard({
  title,
  icon,
  gradientFrom,
  gradientTo,
  protein,
  fiber,
  proteinGoal,
  fiberGoal,
  onProteinChange,
  onFiberChange,
  isComplete,
}: MealCardProps) {
  return (
    <motion.div
      className="bg-white/70 backdrop-blur-xl rounded-2xl p-4 border border-white/50"
      whileHover={{ scale: 1.01 }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 bg-gradient-to-br ${gradientFrom} ${gradientTo} rounded-xl flex items-center justify-center`}>
            {icon}
          </div>
          <p className="text-gray-800">{title}</p>
        </div>
        {isComplete && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-6 h-6 bg-green-400 rounded-full flex items-center justify-center"
          >
            <Check className="w-4 h-4 text-white" />
          </motion.div>
        )}
      </div>

      {/* Protein input */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <Label>Proteína</Label>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 rounded-full"
              onClick={() => onProteinChange(Math.max(0, protein - 5))}
            >
              <Minus className="w-3 h-3" />
            </Button>
            <span className="text-sm min-w-[60px] text-center">
              <span className="text-blue-600">{protein}g</span>
              <span className="text-gray-400 text-xs"> / {proteinGoal}g</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 rounded-full"
              onClick={() => onProteinChange(protein + 5)}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <Slider
          value={[protein]}
          onValueChange={(values) => onProteinChange(values[0])}
          max={proteinGoal * 2}
          step={1}
          className="w-full"
        />
        <div className="relative h-1.5 bg-blue-100 rounded-full overflow-hidden mt-2">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min((protein / proteinGoal) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Fiber input */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Fibra</Label>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 rounded-full"
              onClick={() => onFiberChange(Math.max(0, fiber - 2))}
            >
              <Minus className="w-3 h-3" />
            </Button>
            <span className="text-sm min-w-[60px] text-center">
              <span className="text-green-600">{fiber}g</span>
              <span className="text-gray-400 text-xs"> / {fiberGoal}g</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 rounded-full"
              onClick={() => onFiberChange(fiber + 2)}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <Slider
          value={[fiber]}
          onValueChange={(values) => onFiberChange(values[0])}
          max={fiberGoal * 2}
          step={1}
          className="w-full"
        />
        <div className="relative h-1.5 bg-green-100 rounded-full overflow-hidden mt-2">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-400 to-green-600 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min((fiber / fiberGoal) * 100, 100)}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-600">{children}</p>;
}
