require('dotenv').config();
const { TelegramBot } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TELEGRAM_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env vars: TELEGRAM_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const bot = new TelegramBot(TELEGRAM_TOKEN);

// Muscle groups mapping
const MUSCLE_GROUPS = {
  chest: ['pectorals'],
  back: ['latissimus_dorsi', 'trapezius', 'erector_spinae'],
  legs: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
  shoulders: ['deltoids'],
  arms: ['biceps', 'triceps', 'forearms'],
  core: ['abdominals', 'obliques'],
};

function getMuscleCategory(muscleName) {
  const normalized = muscleName.toLowerCase().replace(/\s+/g, '_');
  for (const [category, muscles] of Object.entries(MUSCLE_GROUPS)) {
    if (muscles.some(m => normalized.includes(m))) return category;
  }
  return 'other';
}

function calculateMuscleFatigue(workouts, muscleGroup) {
  const relevantWorkouts = workouts
    .filter(w => w.muscle_groups?.includes(muscleGroup))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (relevantWorkouts.length === 0) return 0;

  const lastWorkout = relevantWorkouts[0];
  const daysSince = (Date.now() - new Date(lastWorkout.date).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.min(100, 100 * Math.pow(0.5, daysSince)));
}

function selectMuscleGroups(fatigueMap, maxGroups = 3) {
  const available = Object.entries(fatigueMap)
    .filter(([_, fatigue]) => fatigue < 70)
    .sort((a, b) => a[1] - b[1]);
  
  if (available.length === 0) {
    return Object.entries(fatigueMap)
      .sort((a, b) => a[1] - b[1])
      .slice(0, maxGroups)
      .map(([group]) => group);
  }
  
  return available.slice(0, maxGroups).map(([group]) => group);
}

async function getOrCreateUser(telegramId, username) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ telegram_id: telegramId, username: username || `user_${telegramId}` }, { onConflict: 'telegram_id' })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getWorkouts(profileId) {
  const { data, error } = await supabase
    .from('workouts')
    .select('*, workout_exercises(*, exercise:exercises(*))')
    .eq('profile_id', profileId)
    .order('date', { ascending: false })
    .limit(20);
  
  if (error) throw error;
  return data;
}

async function getAllExercises() {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('name');
  
  if (error) throw error;
  return data;
}

async function createWorkout(profileId, workoutData) {
  const { data, error } = await supabase
    .from('workouts')
    .insert({
      profile_id: profileId,
      name: workoutData.name,
      date: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (error) throw error;
  
  const exerciseRows = workoutData.exercises.map((ex, idx) => ({
    workout_id: data.id,
    exercise_id: ex.exercise_id,
    order: idx,
    target_sets: ex.sets,
    target_reps: ex.reps,
    target_weight: ex.weight,
  }));
  
  const { data: insertedExercises, error: exError } = await supabase
    .from('workout_exercises')
    .insert(exerciseRows)
    .select();
  
  if (exError) throw exError;
  
  const logRows = [];
  insertedExercises.forEach(we => {
    for (let i = 1; i <= we.target_sets; i++) {
      logRows.push({
        workout_exercise_id: we.id,
        set_number: i,
        reps_completed: workoutData.exercises[we.order].reps_completed || we.target_reps,
        weight_used: we.target_weight,
      });
    }
  });
  
  const { error: logError } = await supabase
    .from('exercise_logs')
    .insert(logRows);
  
  if (logError) throw logError;
  
  return data;
}

async function updatePersonalRecords(profileId, exercises) {
  for (const ex of exercises) {
    const { data: existing } = await supabase
      .from('personal_records')
      .select('*')
      .eq('profile_id', profileId)
      .eq('exercise_id', ex.exercise_id)
      .maybeSingle();
    
    const estimated1RM = Math.round(ex.weight * (1 + ex.reps_completed / 30));
    
    if (!existing) {
      await supabase.from('personal_records').insert({
        profile_id: profileId,
        exercise_id: ex.exercise_id,
        max_weight: ex.weight,
        max_reps_at_weight: ex.reps_completed,
        estimated_1rm: estimated1RM,
      });
    } else if (ex.weight > existing.max_weight || ex.reps_completed > existing.max_reps_at_weight) {
      await supabase
        .from('personal_records')
        .update({
          max_weight: Math.max(existing.max_weight, ex.weight),
          max_reps_at_weight: Math.max(existing.max_reps_at_weight, ex.reps_completed),
          estimated_1rm: estimated1RM,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
  }
}

// Bot commands
bot.command('start', async (ctx) => {
  const user = ctx.from;
  try {
    await getOrCreateUser(user.id.toString(), user.username);
    await ctx.reply(
      `Hey ${user.first_name}! I'm your workout assistant.\n\n` +
      'Commands:\n' +
      '/generate - Generate a new workout\n' +
      '/history - View workout history\n' +
      '/progress - See your progress & PRs'
    );
  } catch (err) {
    await ctx.reply('Error setting up your account. Please try again.');
  }
});

bot.command('generate', async (ctx) => {
  const keyboard = [
    [{ text: 'Full Body', callback_data: 'gen_full_body' }],
    [{ text: 'Chest', callback_data: 'gen_chest' }, { text: 'Back', callback_data: 'gen_back' }],
    [{ text: 'Legs', callback_data: 'gen_legs' }, { text: 'Shoulders', callback_data: 'gen_shoulders' }],
    [{ text: 'Arms', callback_data: 'gen_arms' }, { text: 'Core', callback_data: 'gen_core' }],
  ];
  await ctx.reply('Choose a workout focus:', { reply_markup: { inline_keyboard: keyboard } });
});

bot.callbackQuery(/^gen_(.+)$/, async (ctx) => {
  const focus = ctx.match[1];
  const keyboard = [
    [{ text: 'Easy', callback_data: `diff_${focus}_easy` },
     { text: 'Moderate', callback_data: `diff_${focus}_moderate` },
     { text: 'Hard', callback_data: `diff_${focus}_hard` }]
  ];
  await ctx.editMessageText(`Choose difficulty for ${focus.replace('_', ' ')} workout:`, { reply_markup: { inline_keyboard: keyboard } });
});

bot.callbackQuery(/^diff_(.+)_(easy|moderate|hard)$/, async (ctx) => {
  const focus = ctx.match[1];
  const difficulty = ctx.match[2];
  const telegramId = ctx.from.id.toString();
  
  await ctx.editMessageText('⏳ Generating your workout...');
  
  try {
    const user = await getOrCreateUser(telegramId, ctx.from.username);
    const workouts = await getWorkouts(user.id);
    const exercises = await getAllExercises();
    
    const muscleGroups = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];
    const fatigueMap = {};
    muscleGroups.forEach(group => {
      fatigueMap[group] = calculateMuscleFatigue(workouts, group);
    });
    
    const selectedGroups = selectMuscleGroups(fatigueMap, focus === 'full_body' ? 3 : 1);
    
    const selectedExercises = [];
    for (const group of selectedGroups) {
      const groupExercises = exercises.filter(ex => {
        const exCategory = getMuscleCategory(ex.muscle_name || '');
        return exCategory === group;
      });
      selectedExercises.push(...groupExercises.slice(0, 2));
    }
    
    let msg = `💪 *${focus.replace('_', ' ')} Workout*\n\n`;
    const workoutExercises = [];
    
    for (const ex of selectedExercises) {
      const exLogs = workouts
        .flatMap(w => w.workout_exercises || [])
        .filter(we => we.exercise_id === ex.id)
        .flatMap(we => we.exercise_logs || []);
      
      const recentLogs = exLogs.slice(-3);
      const avgReps = recentLogs.length > 0 
        ? recentLogs.reduce((sum, log) => sum + log.reps_completed, 0) / recentLogs.length 
        : ex.default_reps;
      const targetReps = ex.default_reps || 10;
      const completionRatio = avgReps / targetReps;
      
      let weight = ex.default_weight || 0;
      if (completionRatio >= 1.2) weight = Math.round(weight * 1.1);
      else if (completionRatio >= 1.0) weight = Math.round(weight * 1.05);
      else if (completionRatio <= 0.6) weight = Math.round(weight * 0.9);
      else if (completionRatio <= 0.8) weight = Math.round(weight * 0.95);
      
      workoutExercises.push({
        exercise_id: ex.id,
        name: ex.name,
        sets: 3,
        reps: targetReps,
        weight: weight,
        reps_completed: targetReps,
      });
      
      msg += `${selectedExercises.indexOf(ex) + 1}. ${ex.name}\n`;
      msg += `   3 sets × ${targetReps} reps @ ${weight} lbs\n\n`;
    }
    
    await ctx.editMessageText(msg, { parse_mode: 'Markdown' });
    
    // Store workout data for logging
    ctx.session.workout = { name: `${focus.replace('_', ' ')} Workout`, exercises: workoutExercises };
    
    const logKeyboard = [[{ text: '✅ Log as completed', callback_data: 'log_this' }]];
    await ctx.reply('Ready to log this workout?', { reply_markup: { inline_keyboard: logKeyboard } });
  } catch (err) {
    console.error(err);
    await ctx.editMessageText('Error generating workout. Please try again.');
  }
});

bot.callbackQuery('log_this', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const workout = ctx.session.workout;
  
  if (!workout) {
    await ctx.editMessageText('No pending workout to log.');
    return;
  }
  
  try {
    const user = await getOrCreateUser(telegramId, ctx.from.username);
    await createWorkout(user.id, workout);
    await updatePersonalRecords(user.id, workout.exercises);
    await ctx.editMessageText('✅ Workout logged!');
    delete ctx.session.workout;
  } catch (err) {
    console.error(err);
    await ctx.editMessageText('Error logging workout. Please try again.');
  }
});

bot.callbackQuery('history', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  try {
    const user = await getOrCreateUser(telegramId, ctx.from.username);
    const workouts = await getWorkouts(user.id);
    
    if (workouts.length === 0) {
      await ctx.editMessageText('No workout history yet.');
      return;
    }
    
    let msg = '📊 *Recent Workouts:*\n\n';
    workouts.forEach(w => {
      msg += `• ${w.name} - ${new Date(w.date).toLocaleDateString()}\n`;
      msg += `  ${w.workout_exercises?.length || 0} exercises\n\n`;
    });
    
    await ctx.editMessageText(msg, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.editMessageText('Error loading history.');
  }
});

bot.command('history', async (ctx) => {
  const keyboard = [[{ text: 'View History', callback_data: 'history' }]];
  await ctx.reply('View your recent workouts:', { reply_markup: { inline_keyboard: keyboard } });
});

bot.command('progress', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  try {
    const user = await getOrCreateUser(telegramId, ctx.from.username);
    const { data: records, error } = await supabase
      .from('personal_records')
      .select('*, exercise:exercises(*)')
      .eq('profile_id', user.id)
      .order('updated_at', { ascending: false });
    
    if (error || !records || records.length === 0) {
      await ctx.reply('No progress data yet. Complete some workouts!');
      return;
    }
    
    let msg = '🏆 *Personal Records:*\n\n';
    records.forEach(pr => {
      msg += `• ${pr.exercise?.name || 'Unknown'}\n`;
      msg += `  ${pr.max_weight} lbs × ${pr.max_reps_at_weight} reps\n`;
      msg += `  Est. 1RM: ${pr.estimated_1rm} lbs\n\n`;
    });
    
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply('Error loading progress.');
  }
});

bot.start();
console.log('Telegram bot started!');
