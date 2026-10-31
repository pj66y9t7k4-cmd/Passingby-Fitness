import { supabase } from '../lib/supabaseClient';

export async function getOrCreateUser(telegramId, username) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ telegram_id: telegramId, username: username || `user_${telegramId}` }, { onConflict: 'telegram_id' })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getWorkouts(profileId, limit = 20) {
  const { data, error } = await supabase
    .from('workouts')
    .select('*, workout_exercises(*, exercise:exercises(*))')
    .eq('profile_id', profileId)
    .order('date', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data;
}

export async function createWorkout(profileId, workoutData) {
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
  
  // Insert workout exercises
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
  
  // Insert logs for each set
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
  
  // Update personal records
  await updatePersonalRecords(profileId, workoutData.exercises);
  
  return data;
}

export async function updatePersonalRecords(profileId, exercises) {
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

export async function getPersonalRecords(profileId) {
  const { data, error } = await supabase
    .from('personal_records')
    .select('*, exercise:exercises(*)')
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function getExerciseLogs(profileId, exerciseId) {
  const { data, error } = await supabase
    .from('exercise_logs')
    .select('*, workout_exercise:workout_exercises(*, workout:workouts(*))')
    .eq('workout_exercise.exercise_id', exerciseId)
    .eq('workout_exercise.workout.profile_id', profileId)
    .order('workout_exercise.workout.date', { ascending: false })
    .limit(10);
  
  if (error) throw error;
  return data;
}

export async function syncExercises(exercises) {
  const rows = exercises.map(ex => ({
    wger_id: ex.id,
    name: ex.name,
    description: ex.description || '',
    muscle_name: ex.muscles?.[0]?.name || 'other',
    equipment_name: ex.equipment?.[0]?.name || 'none',
    default_sets: 3,
    default_reps: ex.repetitions || 10,
    default_weight: 0,
  }));
  
  const { data, error } = await supabase
    .from('exercises')
    .upsert(rows, { onConflict: 'wger_id' })
    .select();
  
  if (error) throw error;
  return data;
}

export async function getAllExercises() {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('name');
  
  if (error) throw error;
  return data;
}
