import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { requestNotificationPermission, showNotification } from "../utils/pwa";

// Arduino BLE Commands
export const LED_COMMANDS = {
  OFF: 0,
  WATER: 1,
  BALANCED: 2,
  UNBALANCED: 3,
  GREAT_FINISH: 4,
  BAD_FINISH: 5,
} as const;

type LEDCommand = typeof LED_COMMANDS[keyof typeof LED_COMMANDS];

interface BluetoothContextType {
  isConnected: boolean;
  isConnecting: boolean;
  deviceName: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendCommand: (command: LEDCommand) => Promise<void>;
  lastCommand: LEDCommand | null;
}

const BluetoothContext = createContext<BluetoothContextType | undefined>(undefined);

// Arduino Nado BLE UUIDs
const ARDUINO_SERVICE_UUID = "19b10000-e8f2-537e-4f6c-d104768a1214";
const ARDUINO_CHARACTERISTIC_UUID = "19b10001-e8f2-537e-4f6c-d104768a1214";

export function BluetoothProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<any | null>(null);
  const [characteristic, setCharacteristic] = useState<any | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<LEDCommand | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  useEffect(() => {
    if (!(navigator as any).bluetooth) {
      setError("Bluetooth no está disponible en este navegador. Usa Chrome, Edge o Opera.");
      console.error("Web Bluetooth API no disponible");
    }
  }, []);

  useEffect(() => {
    if (isConnected && deviceName) {
      localStorage.setItem("lumi_bluetooth_device", deviceName);
    }
  }, [isConnected, deviceName]);

  const handleDisconnect = () => {
    console.log("Dispositivo Bluetooth desconectado");
    setIsConnected(false);
    setCharacteristic(null);
    setDeviceName(null);
    setError("Dispositivo desconectado");
    try {
      showNotification("Lumi desconectado", {
        body: "Se perdió la conexión con tu dispositivo Lumi.",
        tag: "bluetooth-connection",
      });
    } catch (e) {
      console.debug("Notification failed:", e);
    }
  };

  const connect = async () => {
    if (!(navigator as any).bluetooth) {
      setError("Bluetooth no está disponible en este navegador");
      return;
    }

    if (!window.isSecureContext) {
      setError("Bluetooth requiere HTTPS. Por favor, accede a la app mediante HTTPS.");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      await requestNotificationPermission().catch(console.debug);

      console.log("Buscando dispositivos BLE (aceptando todos los dispositivos)...");

      // Request any nearby BLE device. We include the Arduino service UUID as an optional
      // service so that devices exposing it will still be accessible, but we allow the user
      // to pick any device in case the target doesn't advertise that UUID.
      const selectedDevice = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [ARDUINO_SERVICE_UUID],
      });

      console.log("Dispositivo seleccionado:", selectedDevice?.name || selectedDevice?.id);
      if (!selectedDevice) throw new Error("No se seleccionó ningún dispositivo");

  setDevice(selectedDevice as any);
  setDeviceName(selectedDevice.name || selectedDevice.id || "Dispositivo BLE");

      selectedDevice.addEventListener("gattserverdisconnected", async () => {
        console.log("Dispositivo GATT desconectado, manejador de evento activado");
        setIsConnected(false);
        setCharacteristic(null);
        // Try to auto-reconnect a few times
        if (reconnectAttempts < 3) {
          const attempt = reconnectAttempts + 1;
          setReconnectAttempts(attempt);
          const backoff = 1000 * attempt;
          console.log(`Intentando reconectar en ${backoff}ms (intento ${attempt})`);
          setTimeout(async () => {
            try {
              await connect();
            } catch (err) {
              console.debug("Reconnect failed:", err);
            }
          }, backoff);
        } else {
          handleDisconnect();
        }
      });

      console.log("Conectando al servidor GATT...");
      const server = await selectedDevice.gatt?.connect();
      if (!server) throw new Error("No se pudo conectar al servidor GATT");

      // Try to find the Arduino-specific service/characteristic first. If it's not present,
      // iterate the available services and characteristics to find a writable characteristic.
  let char: any | null = null;
      try {
        const service = await server.getPrimaryService(ARDUINO_SERVICE_UUID);
        char = await service.getCharacteristic(ARDUINO_CHARACTERISTIC_UUID);
      } catch (e) {
        console.debug("Servicio/característica Arduino no encontrada, buscando característica escribible...", e);
        // Fetch all services and search for a writable characteristic
        const services = await server.getPrimaryServices();
        for (const svc of services) {
          try {
            const chars = await svc.getCharacteristics();
            for (const c of chars) {
              if (c.properties.write || c.properties.writeWithoutResponse) {
                char = c;
                break;
              }
            }
            if (char) break;
          } catch (innerErr) {
            console.debug("Error iterating characteristics for service", svc.uuid, innerErr);
          }
        }
      }

      if (!char) throw new Error("No se encontró una característica escribible en el dispositivo BLE");

      // Enable notifications if the characteristic supports it
      if (char.properties.notify) {
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', (event: Event) => {
          const val = (event.target as any).value;
          if (val) {
            console.log('Received value from Arduino:', new Uint8Array(val.buffer));
          }
        });
      }

      setCharacteristic(char);
      setIsConnected(true);
      setError(null);

      try {
        showNotification("Lumi conectado", {
          body: `Conectado a ${selectedDevice.name || "Arduino Nado"}`,
          tag: "bluetooth-connection",
        });
      } catch (e) {
        console.debug("Notification failed:", e);
      }

      // Send initial OFF command
      await sendCommandInternal(char, LED_COMMANDS.OFF);
      
    } catch (err) {
      console.error("Error de conexión Bluetooth:", err);
      
  let errorMessage = "Error al conectar";
      
      if (err instanceof DOMException) {
        switch (err.name) {
          case 'SecurityError':
            errorMessage = "Bluetooth bloqueado por política de seguridad. Verifica que estés usando HTTPS y que los permisos estén habilitados.";
            break;
          case 'NotFoundError':
            errorMessage = "No se encontró ningún dispositivo Arduino Nado. Asegúrate de que esté encendido y cerca.";
            break;
          case 'NotAllowedError':
            errorMessage = "Permiso denegado. Por favor, permite el acceso a Bluetooth.";
            break;
          default:
            errorMessage = err.message;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setIsConnected(false);
      setCharacteristic(null);
      
      try {
        showNotification("Error Bluetooth", {
          body: errorMessage,
          tag: "bluetooth-error",
        });
      } catch (e) {
        console.debug("Notification failed:", e);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    if (device?.gatt?.connected) {
      try {
        device.gatt.disconnect();
        console.log("Desconexión iniciada");
      } catch (e) {
        console.debug("Error disconnecting device:", e);
      }
    }

    setDevice(null);
    setCharacteristic(null);
    setIsConnected(false);
    setDeviceName(null);
    setLastCommand(null);
    localStorage.removeItem("lumi_bluetooth_device");
  };

  const sendCommandInternal = async (char: any, command: LEDCommand) => {
    try {
      // Send command as a single byte using BLE write
      const data = new Uint8Array([command]);
      // Prefer writeValue (standard). If the characteristic only supports withoutResponse, try that.
      try {
        await (char as BluetoothRemoteGATTCharacteristic).writeValue(data);
      } catch (writeErr) {
        console.debug("writeValue failed, trying writeValueWithoutResponse if available", writeErr);
        // Some implementations expose writeValueWithoutResponse
        if ((char as any).writeValueWithoutResponse) {
          await (char as any).writeValueWithoutResponse(data);
        } else {
          throw writeErr;
        }
      }
      console.log(`Comando BLE enviado: ${command}`);
      setLastCommand(command);
      
      if (command === LED_COMMANDS.WATER) {
        try {
          showNotification("Hora de hidratarte", {
            body: "Tu Lumi indica que necesitas agua. Toca para ver el recordatorio.",
            tag: "hydration-alert",
            data: { url: "/hydration" },
          });
        } catch (e) {
          console.debug("Notification failed:", e);
        }
      }
      return true;
    } catch (err) {
      console.error("Error al enviar comando BLE:", err);
      throw err;
    }
  };

  const sendCommand = async (command: LEDCommand) => {
    if (!isConnected || !characteristic) {
      console.warn("No hay conexión Bluetooth activa");
      setError("No hay conexión Bluetooth activa");
      return;
    }

    try {
      await sendCommandInternal(characteristic, command);
      setError(null);
    } catch (err) {
      console.error("Error al enviar comando:", err);
      setError("Error al enviar comando al dispositivo");
      
      // Si hay error, intentar reconectar
      if (device?.gatt && device.gatt.connected === false) {
        setIsConnected(false);
        setCharacteristic(null);
      }
    }
  };

  return (
    <BluetoothContext.Provider
      value={{
        isConnected,
        isConnecting,
        deviceName,
        error,
        connect,
        disconnect,
        sendCommand,
        lastCommand,
      }}
    >
      {children}
    </BluetoothContext.Provider>
  );
}

export function useBluetooth() {
  const context = useContext(BluetoothContext);
  if (context === undefined) {
    throw new Error("useBluetooth must be used within a BluetoothProvider");
  }
  return context;
}
