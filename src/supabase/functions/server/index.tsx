import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as kv from "./kv.tsx";

const app = new Hono();

// Create Supabase client for auth
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-7e221a31/health", (c) => {
  return c.json({ status: "ok" });
});

// Test Supabase connection endpoint
app.get("/make-server-7e221a31/test-supabase", async (c) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    const envStatus = {
      hasUrl: !!supabaseUrl,
      hasServiceRoleKey: !!supabaseServiceRoleKey,
      hasAnonKey: !!supabaseAnonKey,
      url: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'missing'
    };
    
    console.log("Supabase env check:", envStatus);
    
    // Try to get user count as a test
    const { data, error, count } = await supabase
      .from('kv_store_7e221a31')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error("Supabase test query error:", error);
      return c.json({ 
        status: "error", 
        error: error.message,
        env: envStatus 
      }, 500);
    }
    
    return c.json({ 
      status: "ok", 
      message: "Supabase connection working",
      env: envStatus,
      kvRecordCount: count
    });
  } catch (error) {
    console.error("Test endpoint error:", error);
    return c.json({ 
      status: "error", 
      error: error.message || 'Unknown error'
    }, 500);
  }
});

// Authentication Endpoints

// Sign up new user
app.post("/make-server-7e221a31/auth/signup", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, name, dayStartTime, dayEndTime } = body;

    console.log("Signup request received for email:", email);

    if (!email || !password || !name) {
      console.log("Missing required fields:", { email: !!email, password: !!password, name: !!name });
      return c.json({ error: "Email, password, and name are required" }, 400);
    }

    // Check environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("Missing Supabase environment variables:", { 
        hasUrl: !!supabaseUrl, 
        hasServiceKey: !!supabaseServiceRoleKey 
      });
      return c.json({ error: "Server configuration error: Missing Supabase credentials" }, 500);
    }

    console.log("Creating user with Supabase Auth...");

    // Create user with Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true,
    });

    if (error) {
      console.error("Supabase auth error:", error);
      return c.json({ error: `Authentication error: ${error.message}` }, 400);
    }

    if (!data.user) {
      console.error("No user data returned from Supabase");
      return c.json({ error: "Failed to create user: No user data returned" }, 500);
    }

    console.log("User created successfully:", data.user.id);

    // Initialize user data in KV store
    const userId = data.user.id;
    try {
      await kv.set(`user:${userId}`, {
        userId,
        email,
        name,
        dayStartTime: dayStartTime || "06:00",
        dayEndTime: dayEndTime || "22:00",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Initialize streak data
      await kv.set(`streak:${userId}`, {
        currentStreak: 0,
        longestStreak: 0,
        lastBalancedDate: null,
      });

      console.log("User data initialized in KV store");
    } catch (kvError) {
      console.error("Error storing user data in KV:", kvError);
      // Continue anyway, data can be created later
    }

    return c.json({ 
      success: true, 
      user: {
        id: userId,
        email,
        name,
      }
    });
  } catch (error) {
    console.error("Unexpected error in signup:", error);
    return c.json({ error: `Failed to sign up user: ${error.message || 'Unknown error'}` }, 500);
  }
});

// Sign in user (handled by Supabase client in frontend)
// This endpoint is for reference - actual signin happens client-side
app.post("/make-server-7e221a31/auth/signin", async (c) => {
  try {
    // This is handled by Supabase client-side auth
    // Just return instructions
    return c.json({ 
      message: "Use Supabase client signInWithPassword on frontend",
      success: true 
    });
  } catch (error) {
    console.log("Error in signin:", error);
    return c.json({ error: "Failed to sign in" }, 500);
  }
});

// User Profile Endpoints

// Create or update user profile (requires auth)
app.post("/make-server-7e221a31/users/profile", async (c) => {
  try {
    // Verify user is authenticated
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized - no token provided" }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user?.id) {
      console.log("Auth error:", authError);
      return c.json({ error: "Unauthorized - invalid token" }, 401);
    }

    const userId = user.id;
    const body = await c.req.json();
    const { profile } = body;

    if (!profile) {
      return c.json({ error: "profile is required" }, 400);
    }

    // Get existing user data to preserve email and name
    const existingUser = await kv.get(`user:${userId}`);
    
    // Store user profile
    await kv.set(`user:${userId}`, {
      ...(existingUser || {}),
      ...profile,
      userId,
      updatedAt: new Date().toISOString(),
    });

    // Initialize daily tracking for today
    const today = new Date().toISOString().split('T')[0];
    const existingDaily = await kv.get(`daily:${userId}:${today}`);
    
    if (!existingDaily) {
      await kv.set(`daily:${userId}:${today}`, {
        date: today,
        waterGlasses: 0,
        meals: [],
        totalProtein: 0,
        totalFiber: 0,
      });
    }

    return c.json({ success: true, userId });
  } catch (error) {
    console.log("Error creating/updating user profile:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: "Failed to create/update user profile", details: errorMessage }, 500);
  }
});

// Get user profile
app.get("/make-server-7e221a31/users/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    console.log("Getting user profile for userId:", userId);
    
    if (!userId || userId === 'undefined' || userId === 'null') {
      console.log("Invalid userId provided");
      return c.json({ error: "Invalid user ID" }, 400);
    }
    
    const user = await kv.get(`user:${userId}`);
    console.log("User data retrieved from KV:", user ? "Found" : "Not found");

    if (!user) {
      console.log("User not found in database for userId:", userId);
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ user });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return c.json({ error: `Failed to fetch user: ${error.message || 'Unknown error'}` }, 500);
  }
});

// Hydration Endpoints

// Add water consumption
app.post("/make-server-7e221a31/hydration/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const body = await c.req.json();
    const { glasses = 1 } = body;

    const today = new Date().toISOString().split('T')[0];
    const key = `daily:${userId}:${today}`;
    
    // Get current daily data
    let dailyData = await kv.get(key);
    
    if (!dailyData) {
      dailyData = {
        date: today,
        waterGlasses: 0,
        meals: [],
        totalProtein: 0,
        totalFiber: 0,
      };
    }

    // Update water consumption
    dailyData.waterGlasses = (dailyData.waterGlasses || 0) + glasses;
    dailyData.lastUpdated = new Date().toISOString();

    await kv.set(key, dailyData);

    // Attempt to insert a notification row into the Postgres notifications table
    // so a Database Webhook can trigger server-side push delivery.
    try {
      const notif = {
        user_id: userId,
        title: 'Hidratación registrada',
        body: `¡Has registrado ${glasses} vaso(s) de agua! Llevas ${dailyData.waterGlasses} hoy.`,
        data: { waterGlasses: dailyData.waterGlasses },
        created_at: new Date().toISOString(),
      } as any;

      const { error: notifErr } = await supabase.from('notifications').insert([notif]);
      if (notifErr) {
        console.error('Failed to insert notification row:', notifErr);
      } else {
        console.log('Inserted notification row for user', userId);
      }
    } catch (insertError) {
      console.error('Exception while inserting notification row:', insertError);
    }

    return c.json({ success: true, waterGlasses: dailyData.waterGlasses });
  } catch (error) {
    console.log("Error adding water consumption:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: "Failed to add water consumption", details: errorMessage }, 500);
  }
});

// Get hydration data for a specific date
app.get("/make-server-7e221a31/hydration/:userId/:date", async (c) => {
  try {
    const userId = c.req.param("userId");
    const date = c.req.param("date");
    
    const dailyData = await kv.get(`daily:${userId}:${date}`);

    if (!dailyData) {
      return c.json({ 
        date,
        waterGlasses: 0,
        meals: [],
        totalProtein: 0,
        totalFiber: 0,
      });
    }

    return c.json({ data: dailyData });
  } catch (error) {
    console.log("Error fetching hydration data:", error);
    return c.json({ error: "Failed to fetch hydration data" }, 500);
  }
});

// Get hydration history (last N days)
app.get("/make-server-7e221a31/hydration/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const days = parseInt(c.req.query("days") || "7");
    
    const allKeys = await kv.getByPrefix(`daily:${userId}:`);
    
    // Sort by date descending and take last N days
    const sortedData = allKeys
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, days);

    return c.json({ history: sortedData });
  } catch (error) {
    console.log("Error fetching hydration history:", error);
    return c.json({ error: "Failed to fetch hydration history" }, 500);
  }
});

// Nutrition Endpoints

// Add meal
app.post("/make-server-7e221a31/nutrition/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const body = await c.req.json();
    const { meal } = body;

    if (!meal) {
      return c.json({ error: "meal data is required" }, 400);
    }

    const today = new Date().toISOString().split('T')[0];
    const key = `daily:${userId}:${today}`;
    
    // Get current daily data
    let dailyData = await kv.get(key);
    
    if (!dailyData) {
      dailyData = {
        date: today,
        waterGlasses: 0,
        meals: [],
        totalProtein: 0,
        totalFiber: 0,
      };
    }

    // Add meal
    dailyData.meals = dailyData.meals || [];
    dailyData.meals.push({
      ...meal,
      timestamp: new Date().toISOString(),
    });

    // Update totals
    dailyData.totalProtein = dailyData.meals.reduce((sum, m) => sum + (m.protein || 0), 0);
    dailyData.totalFiber = dailyData.meals.reduce((sum, m) => sum + (m.fiber || 0), 0);
    dailyData.lastUpdated = new Date().toISOString();

    await kv.set(key, dailyData);

    return c.json({ 
      success: true, 
      totalProtein: dailyData.totalProtein,
      totalFiber: dailyData.totalFiber,
    });
  } catch (error) {
    console.log("Error adding meal:", error);
    return c.json({ error: "Failed to add meal" }, 500);
  }
});

// Helper function to calculate if day was balanced
function isDayBalanced(dailyData: any, userProfile: any): boolean {
  if (!dailyData || !userProfile) return false;
  
  // Calculate nutritional needs
  let proteinMultiplier = 1.0;
  if (userProfile.activityLevel === "light") proteinMultiplier = 1.2;
  if (userProfile.activityLevel === "moderate") proteinMultiplier = 1.4;
  if (userProfile.activityLevel === "very") proteinMultiplier = 1.6;
  
  const dailyProtein = Math.round(userProfile.weight * proteinMultiplier);
  
  let dailyFiber = 25;
  if (userProfile.gender === "male") {
    dailyFiber = userProfile.age < 50 ? 38 : 30;
  } else {
    dailyFiber = userProfile.age < 50 ? 25 : 21;
  }
  
  // Check if 80% threshold met
  const proteinMet = (dailyData.totalProtein || 0) >= dailyProtein * 0.8;
  const fiberMet = (dailyData.totalFiber || 0) >= dailyFiber * 0.8;
  
  return proteinMet && fiberMet;
}

// Helper function to update streak
async function updateStreak(userId: string, date: string, isBalanced: boolean) {
  try {
    let streakData = await kv.get(`streak:${userId}`);
    
    if (!streakData) {
      streakData = {
        currentStreak: 0,
        longestStreak: 0,
        lastBalancedDate: null,
      };
    }
    
    if (isBalanced) {
      const lastDate = streakData.lastBalancedDate;
      
      if (!lastDate) {
        // First balanced day
        streakData.currentStreak = 1;
        streakData.longestStreak = Math.max(1, streakData.longestStreak || 0);
        streakData.lastBalancedDate = date;
      } else {
        // Check if consecutive day
        const lastDateTime = new Date(lastDate).getTime();
        const currentDateTime = new Date(date).getTime();
        const daysDiff = Math.floor((currentDateTime - lastDateTime) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 1) {
          // Consecutive day
          streakData.currentStreak += 1;
          streakData.longestStreak = Math.max(streakData.currentStreak, streakData.longestStreak || 0);
          streakData.lastBalancedDate = date;
        } else if (daysDiff > 1) {
          // Streak broken
          streakData.currentStreak = 1;
          streakData.lastBalancedDate = date;
        }
        // If daysDiff === 0, same day, don't change anything
      }
    } else {
      // Day not balanced - check if streak should be broken
      const lastDate = streakData.lastBalancedDate;
      if (lastDate) {
        const lastDateTime = new Date(lastDate).getTime();
        const currentDateTime = new Date(date).getTime();
        const daysDiff = Math.floor((currentDateTime - lastDateTime) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 1) {
          // More than one day gap - streak broken
          streakData.currentStreak = 0;
        }
      }
    }
    
    await kv.set(`streak:${userId}`, streakData);
    return streakData;
  } catch (error) {
    console.log("Error updating streak:", error);
    return null;
  }
}

// Get today's summary
app.get("/make-server-7e221a31/summary/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const today = new Date().toISOString().split('T')[0];
    console.log(`Getting summary for user ${userId} on ${today}`);
    
    const user = await kv.get(`user:${userId}`);
    let dailyData = await kv.get(`daily:${userId}:${today}`);
    const streakData = await kv.get(`streak:${userId}`) || {
      currentStreak: 0,
      longestStreak: 0,
      lastBalancedDate: null,
    };

    console.log("Summary data:", { hasUser: !!user, dailyData, streakData });

    if (!user) {
      console.log("User not found in summary endpoint");
      return c.json({ error: "User not found" }, 404);
    }

    // Create daily record if it doesn't exist
    if (!dailyData) {
      dailyData = {
        date: today,
        waterGlasses: 0,
        meals: [],
        totalProtein: 0,
        totalFiber: 0,
      };
      await kv.set(`daily:${userId}:${today}`, dailyData);
      console.log("Created new daily record for today");
    }

    // Check and update streak based on today's data
    const balanced = isDayBalanced(dailyData, user);
    await updateStreak(userId, today, balanced);

    const summary = {
      user,
      daily: dailyData,
      streak: streakData,
    };

    console.log("Returning summary:", summary);
    return c.json(summary);
  } catch (error) {
    console.log("Error fetching summary:", error);
    return c.json({ error: "Failed to fetch summary" }, 500);
  }
});

// Get streak data
app.get("/make-server-7e221a31/streak/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const streakData = await kv.get(`streak:${userId}`) || {
      currentStreak: 0,
      longestStreak: 0,
      lastBalancedDate: null,
    };

    return c.json(streakData);
  } catch (error) {
    console.log("Error fetching streak:", error);
    return c.json({ error: "Failed to fetch streak" }, 500);
  }
});

// Analytics Endpoints

// Log user event (requires auth)
app.post("/make-server-7e221a31/analytics/event", async (c) => {
  try {
    // Verify user is authenticated
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized - no token provided" }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user?.id) {
      console.log("Auth error while logging event:", authError);
      return c.json({ error: "Unauthorized - invalid token" }, 401);
    }

    const body = await c.req.json();
    const { key, event } = body;

    if (!key || !event) {
      return c.json({ error: "key and event are required" }, 400);
    }

    // Verify the event belongs to the authenticated user
    if (event.userId !== user.id) {
      return c.json({ error: "Cannot log events for other users" }, 403);
    }

    // Store event
    await kv.set(key, event);

    return c.json({ success: true });
  } catch (error) {
    console.log("Error logging event:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: "Failed to log event", details: errorMessage }, 500);
  }
});

// Get user events (requires auth)
app.get("/make-server-7e221a31/analytics/events", async (c) => {
  try {
    // Verify user is authenticated
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized - no token provided" }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user?.id) {
      console.log("Auth error while fetching events:", authError);
      return c.json({ error: "Unauthorized - invalid token" }, 401);
    }

    const userId = c.req.query("userId");
    const eventType = c.req.query("eventType");
    const limit = parseInt(c.req.query("limit") || "100");

    // Verify requesting own events
    if (userId !== user.id) {
      return c.json({ error: "Cannot access events for other users" }, 403);
    }

    // Get all events for user
    const allEvents = await kv.getByPrefix(`user:${userId}:event:`);
    
    // Filter by event type if specified
    let events = allEvents;
    if (eventType) {
      events = events.filter((e: any) => e.eventType === eventType);
    }

    // Sort by timestamp descending and limit
    const sortedEvents = events
      .sort((a: any, b: any) => b.timestamp - a.timestamp)
      .slice(0, limit);

    return c.json({ events: sortedEvents });
  } catch (error) {
    console.log("Error fetching events:", error);
    return c.json({ error: "Failed to fetch events" }, 500);
  }
});

// Get hydration statistics (requires auth)
app.get("/make-server-7e221a31/analytics/hydration-stats", async (c) => {
  try {
    // Verify user is authenticated
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "Unauthorized - no token provided" }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user?.id) {
      console.log("Auth error while fetching hydration stats:", authError);
      return c.json({ error: "Unauthorized - invalid token" }, 401);
    }

    const userId = c.req.query("userId");
    const days = parseInt(c.req.query("days") || "7");

    // Verify requesting own stats
    if (userId !== user.id) {
      return c.json({ error: "Cannot access stats for other users" }, 403);
    }

    // Get all hydration events for user
    const allEvents = await kv.getByPrefix(`user:${userId}:event:`);
    
    // Filter hydration events
    const hydrationEvents = allEvents.filter((e: any) => e.eventType === "hydration_logged");

    // Filter by time range
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentEvents = hydrationEvents.filter((e: any) => e.timestamp >= cutoffTime);

    // Calculate stats
    const totalEvents = recentEvents.length;
    const averagePerDay = totalEvents / days;

    return c.json({
      totalEvents,
      averagePerDay: Math.round(averagePerDay * 10) / 10,
      events: recentEvents.slice(0, 50), // Return last 50 events
    });
  } catch (error) {
    console.log("Error fetching hydration stats:", error);
    return c.json({ error: "Failed to fetch hydration stats" }, 500);
  }
});

Deno.serve(app.fetch);