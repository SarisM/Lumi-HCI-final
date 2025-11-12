import { motion } from "motion/react";
import { User, Activity, Award, Flame, Calendar, TrendingUp, Bluetooth, LogOut, BluetoothConnected, BluetoothOff } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { useBluetooth } from "../contexts/BluetoothContext";
import { Button } from "../components/ui/button";
import { requestNotificationPermission, showNotification } from "../utils/pwa";

interface ProfileScreenProps {
  onReconnectBluetooth?: () => void;
  onLogout?: () => void;
}

export function ProfileScreen({ onReconnectBluetooth, onLogout }: ProfileScreenProps = {}) {
  const { profile, nutritionalNeeds, streakData, dailyHistory, logout, userId, accessToken } = useUser();
  const { isConnected, deviceName, connect, disconnect } = useBluetooth();
  
  const handleLogout = async () => {
    // Log logout event before clearing session (non-blocking)
    if (userId && accessToken) {
      try {
        const { logUserEvent } = await import("../utils/analytics");
        void logUserEvent(userId, accessToken, "profile_updated", {
          action: "logout",
        });
      } catch (error) {
        console.error("Error logging logout event:", error);
      }
    }
    
    // Call the async logout function
    await logout();
    
    if (onLogout) {
      onLogout();
    }
  };

  if (!profile || !nutritionalNeeds) {
    return (
      <div className="relative h-full bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 overflow-hidden p-6 flex flex-col items-center justify-center">
        <motion.div
          className="w-20 h-20 mb-6 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center shadow-xl"
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 10, -10, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <User className="w-10 h-10 text-white" />
        </motion.div>
        <p className="text-gray-600 text-center">
          Cargando tu perfil...
        </p>
        {userId && (
          <motion.div
            className="mt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="bg-white/70 backdrop-blur-xl border-gray-200"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar sesión
            </Button>
          </motion.div>
        )}
      </div>
    );
  }

  const currentStreak = streakData?.currentStreak ?? 0;
  const longestStreak = streakData?.longestStreak ?? 0;

  const activityLabels = {
    sedentary: "Sedentario",
    light: "Ligeramente activo",
    moderate: "Moderadamente activo",
    very: "Muy activo",
  };

  const genderLabels = {
    male: "Masculino",
    female: "Femenino",
    other: "Otro",
  };

  // Get last 7 days for visual
  const last7Days = dailyHistory.slice(-7);

  return (
    <div className="relative h-full bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 overflow-hidden p-6 flex flex-col">
      {/* Background elements */}
      <motion.div
        className="absolute top-1/4 right-10 w-40 h-40 bg-purple-300/20 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
        }}
      />

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <motion.div
              className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-500 rounded-2xl flex items-center justify-center mb-4"
              animate={{
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
              }}
            >
              <User className="w-6 h-6 text-white" />
            </motion.div>
            <h2 className="text-gray-800 mb-1">Tu Perfil</h2>
            <p className="text-sm text-gray-500">Información y progreso</p>
          </div>
          
          {/* Bluetooth reconnect button */}
          {onReconnectBluetooth && (
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button
                onClick={onReconnectBluetooth}
                variant="outline"
                size="sm"
                className="bg-white/70 backdrop-blur-xl border-blue-200 hover:bg-blue-50 hover:border-blue-300"
              >
                <Bluetooth className="w-4 h-4 mr-2 text-blue-600" />
                <span className="text-sm text-blue-600">Reconectar</span>
              </Button>
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* User Info Card */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-5 border border-white/50">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-gray-800 mb-1">{profile.name || "Usuario"}</h3>
              <p className="text-sm text-gray-500">{genderLabels[profile.gender]} · {profile.age} años</p>
            </div>
            <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-500 rounded-2xl flex items-center justify-center">
              <span className="text-white text-xl">{profile.name ? profile.name[0].toUpperCase() : "U"}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3">
              <p className="text-xs text-blue-600 mb-1">Peso</p>
              <p className="text-lg text-blue-900">{profile.weight} kg</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-3">
              <p className="text-xs text-green-600 mb-1">Altura</p>
              <p className="text-lg text-green-900">{profile.height} cm</p>
            </div>
          </div>
        </div>

        {/* Nutritional Goals Card */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-5 border border-white/50">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-purple-500" />
            <h3 className="text-gray-800">Metas Nutricionales</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Proteína diaria</span>
              <span className="text-sm text-blue-600">{nutritionalNeeds.dailyProtein}g</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Fibra diaria</span>
              <span className="text-sm text-green-600">{nutritionalNeeds.dailyFiber}g</span>
            </div>
            <div className="h-px bg-gray-200" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Nivel de actividad</span>
              <span className="text-xs text-gray-500">{activityLabels[profile.activityLevel]}</span>
            </div>
          </div>
        </div>

        {/* Bluetooth Connection Card */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-5 border border-white/50">
          <div className="flex items-center gap-2 mb-3">
            {isConnected ? (
              <BluetoothConnected className="w-4 h-4 text-blue-500" />
            ) : (
              <BluetoothOff className="w-4 h-4 text-gray-400" />
            )}
            <h3 className="text-gray-800">Dispositivo Lumi</h3>
          </div>

          {isConnected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
                <div className="flex items-center gap-3">
                  <motion.div
                    className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center"
                    animate={{
                      scale: [1, 1.1, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                    }}
                  >
                    <Bluetooth className="w-5 h-5 text-white" />
                  </motion.div>
                  <div>
                    <p className="text-sm text-blue-900">{deviceName}</p>
                    <p className="text-xs text-blue-600">Conectado</p>
                  </div>
                </div>
                <Button
                  onClick={disconnect}
                  variant="ghost"
                  size="sm"
                  className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                >
                  Desconectar
                </Button>
              </div>
              <p className="text-xs text-gray-500 text-center">
                Tu Lumi cambiará de color automáticamente según tus hábitos
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-4 bg-gray-50 rounded-xl text-center">
                <Bluetooth className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-600 mb-1">No conectado</p>
                <p className="text-xs text-gray-400">
                  Conecta tu llavero Lumi para recibir notificaciones de bienestar
                </p>
              </div>
              <Button
                onClick={connect}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white"
              >
                <Bluetooth className="w-4 h-4 mr-2" />
                Conectar Lumi
              </Button>
            </div>
          )}
        </div>

        {/* Notifications Card */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-5 border border-white/50">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-indigo-500" />
            <h3 className="text-gray-800">Notificaciones</h3>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-gray-600">Estado actual: <span className="font-medium">{typeof Notification !== 'undefined' ? Notification.permission : 'no soportado'}</span></p>
            <div className="flex items-center gap-2">
              <Button
                onClick={async () => {
                  try {
                    const perm = await requestNotificationPermission();
                    if (perm === 'granted') {
                      await showNotification('Notificaciones activadas', { body: 'Has activado las notificaciones.' });
                    }
                  } catch (e) {
                    console.error('Error requesting notification permission', e);
                  }
                }}
                className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
              >
                Activar notificaciones
              </Button>

              <Button
                variant="ghost"
                onClick={() => {
                  // Reset the dismiss flag so the permission prompt can reappear
                  try {
                    localStorage.removeItem('lumi_notifications_prompt_dismissed');
                    // Optionally inform the user
                    showNotification('Recordatorio reactivado', { body: 'Volverás a ver el recordatorio para activar notificaciones.' }).catch(() => {});
                  } catch (e) {
                    console.debug('Error resetting notification prompt dismiss flag', e);
                  }
                }}
              >
                Volver a mostrar prompt
              </Button>
            </div>
            <p className="text-xs text-gray-500">Las notificaciones funcionan mejor cuando la app está instalada como PWA y el service worker está permitido.</p>
          </div>
        </div>

        {/* Streaks Card - Main Feature */}
        <motion.div
          className="bg-gradient-to-br from-orange-400 to-pink-500 rounded-2xl p-5 border border-white/50 shadow-xl overflow-hidden relative"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          {/* Animated background */}
          <motion.div
            className="absolute inset-0 opacity-20"
            style={{
              background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.5) 0%, transparent 70%)",
            }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.2, 0.3, 0.2],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
            }}
          />

          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-5 h-5 text-white" />
              <h3 className="text-white">Racha de Balance</h3>
            </div>

            <div className="flex items-end gap-6 mb-4">
              <div>
                <p className="text-white/80 text-xs mb-1">Racha actual</p>
                <div className="flex items-baseline gap-1">
                  <motion.span
                    className="text-5xl text-white"
                    key={currentStreak}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    {currentStreak}
                  </motion.span>
                  <span className="text-white/80 text-sm mb-1">días</span>
                </div>
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-1 mb-2">
                  <Award className="w-4 h-4 text-yellow-200" />
                  <p className="text-white/80 text-xs">Mejor racha</p>
                </div>
                <p className="text-white text-xl">{longestStreak} días</p>
              </div>
            </div>

            {/* Last 7 days visualization */}
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-white/80 text-xs">
                <Calendar className="w-3 h-3" />
                <span>Últimos 7 días</span>
              </div>
              <div className="flex gap-1.5">
                {last7Days.map((day, index) => (
                  <motion.div
                    key={day.date}
                    className={`flex-1 h-12 rounded-lg ${
                      day.isBalanced
                        ? "bg-white/90"
                        : "bg-white/20"
                    } flex items-center justify-center`}
                    initial={{ scaleY: 0, opacity: 0 }}
                    animate={{ scaleY: 1, opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    {day.isBalanced && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3 + index * 0.05 }}
                      >
                        <Flame className="w-4 h-4 text-orange-500" />
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </div>
              <div className="flex justify-between text-white/60 text-xs">
                <span>Hace 7d</span>
                <span>Hoy</span>
              </div>
            </div>

            {/* Motivational message */}
            <motion.div
              className="mt-4 bg-white/20 backdrop-blur-sm rounded-xl p-3"
              animate={{
                opacity: [0.8, 1, 0.8],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
              }}
            >
              <p className="text-white text-sm text-center">
                {currentStreak === 0 && "¡Hoy empieza tu aventura! Dale play 🌟"}
                {currentStreak > 0 && currentStreak < 3 && "¡Ese es mi team! Sigamos con todo 🔥"}
                {currentStreak >= 3 && currentStreak < 7 && "¡On fire! Estás que ardes 🚀"}
                {currentStreak >= 7 && currentStreak < 14 && "¡WOW! Una semana siendo increíble ✨"}
                {currentStreak >= 14 && "¡LEGENDARY! Tu energía es contagiosa 🌈💫"}
              </p>
            </motion.div>
          </div>
        </motion.div>

        {/* Logout Button */}
        <motion.div
          className="mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full bg-white/70 backdrop-blur-xl border-red-200 hover:bg-red-50 hover:border-red-300 text-red-600 hover:text-red-700"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
        </motion.div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            className="bg-white/70 backdrop-blur-xl rounded-2xl p-4 border border-white/50"
            whileHover={{ scale: 1.02 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-500 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <span className="text-xs text-gray-600">Días balanceados</span>
            </div>
            <p className="text-2xl text-gray-800">
              {dailyHistory.filter((d) => d.isBalanced).length}
            </p>
            <p className="text-xs text-gray-400">de {dailyHistory.length} registrados</p>
          </motion.div>

          <motion.div
            className="bg-white/70 backdrop-blur-xl rounded-2xl p-4 border border-white/50"
            whileHover={{ scale: 1.02 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-purple-500 rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <span className="text-xs text-gray-600">Tasa de éxito</span>
            </div>
            <p className="text-2xl text-gray-800">
              {Math.round((dailyHistory.filter((d) => d.isBalanced).length / dailyHistory.length) * 100)}%
            </p>
            <p className="text-xs text-gray-400">últimos 14 días</p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
