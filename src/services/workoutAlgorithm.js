/**
 * Fitbod-like workout generation algorithm with muscle fatigue
 */

// Muscle group mapping for Wger muscles to our categories
export const MUSCLE_GROUPS = {
  chest: ['pectorals'],
  back: ['latissimus_dorsi', 'trapezius', 'erector_spinae'],
  legs: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
  shoulders: ['deltoids'],
  arms: ['biceps', 'triceps', 'forearms'],
  core: ['abdominals', 'obliques'],
};

export const EQUIPMENT_MAP = {
  barbell: ['barbell'],
  dumbbell: ['dumbbell'],
  machine: ['machine', 'cable', 'lever', 'smith_machine'],
  bodyweight: ['bodyweight', 'none'],
};

export function getMuscleCategory(muscleName) {
  const normalized = muscleName.toLowerCase().replace(/\s+/g, '_');
  for (const [category, muscles] of Object.entries(MUSCLE_GROUPS)) {
    if (muscles.some(m => normalized.includes(m))) {
      return category;
    }
  }
  return 'other';
}

export function calculateMuscleFatigue(workouts, muscleGroup) {
  // Find the most recent workout that trained this muscle group
  const relevantWorkouts = workouts
    .filter(w => w.muscle_groups?.includes(muscleGroup))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (relevantWorkouts.length === 0) return 0; // Fresh, no fatigue

  const lastWorkout = relevantWorkouts[0];
  const daysSince = (Date.now() - new Date(lastWorkout.date).getTime()) / (1000 * 60 * 60 * 24);
  
  // Fatigue starts at 100%, recovers 50% per day
  // Formula: fatigue = 100 * (0.5 ^ days_since)
  const fatigue = 100 * Math.pow(0.5, daysSince);
  return Math.max(0, Math.min(100, fatigue));
}

export function calculateExerciseDifficulty(logs, targetReps, targetWeight) {
  if (!logs || logs.length === 0) return 0.5; // Unknown, assume moderate

  const recentLogs = logs.slice(-3); // Last 3 sets
  const avgReps = recentLogs.reduce((sum, log) => sum + log.reps_completed, 0) / recentLogs.length;
  
  const completionRatio = avgReps / targetReps;
  
  if (completionRatio >= 1.2) return 0; // Very easy
  if (completionRatio >= 1.0) return 0.3; // Easy
  if (completionRatio >= 0.8) return 0.5; // Moderate
  if (completionRatio >= 0.6) return 0.7; // Hard
  return 1.0; // Very hard
}

export function suggestWeight(logs, targetWeight) {
  if (!logs || logs.length === 0) return targetWeight;
  
  const recentLogs = logs.slice(-3);
  const avgReps = recentLogs.reduce((sum, log) => sum + log.reps_completed, 0) / recentLogs.length;
  const targetReps = recentLogs[0]?.target_reps || 10;
  
  const completionRatio = avgReps / targetReps;
  
  if (completionRatio >= 1.2) {
    // Easy - increase weight by 10%
    return Math.round(targetWeight * 1.1);
  } else if (completionRatio >= 1.0) {
    // Completed easily - increase by 5%
    return Math.round(targetWeight * 1.05);
  } else if (completionRatio <= 0.6) {
    // Struggling - decrease by 10%
    return Math.round(targetWeight * 0.9);
  } else if (completionRatio <= 0.8) {
    // Slightly hard - decrease by 5%
    return Math.round(targetWeight * 0.95);
  }
  
  return targetWeight; // Keep same
}

export function selectMuscleGroups(fatigueMap, maxGroups = 3) {
  // Filter out muscles with >70% fatigue (need rest)
  const available = Object.entries(fatigueMap)
    .filter(([_, fatigue]) => fatigue < 70)
    .sort((a, b) => a[1] - b[1]); // Sort by fatigue (ascending)
  
  if (available.length === 0) {
    // All fatigued, pick the least fatigued
    return Object.entries(fatigueMap)
      .sort((a, b) => a[1] - b[1])
      .slice(0, maxGroups)
      .map(([group]) => group);
  }
  
  return available.slice(0, maxGroups).map(([group]) => group);
}

export function selectExercisesForMuscleGroup(exercises, muscleGroup, equipment, logs, fatigue) {
  // Filter by muscle group and equipment
  let filtered = exercises.filter(ex => {
    const exCategory = getMuscleCategory(ex.muscle_name || '');
    if (exCategory !== muscleGroup) return false;
    if (equipment && equipment !== 'any') {
      const exEquipment = ex.equipment?.map(e => e.name.toLowerCase()) || [];
      const allowed = EQUIPMENT_MAP[equipment] || [];
      if (!exEquipment.some(eq => allowed.some(a => eq.includes(a)))) return false;
    }
    return true;
  });
  
  // Score each exercise
  const scored = filtered.map(ex => {
    const exLogs = logs.filter(l => l.exercise_id === ex.id);
    const difficulty = calculateExerciseDifficulty(exLogs, ex.default_reps || 10, ex.default_weight || 0);
    const fatiguePenalty = fatigue * 0.01; // 0-1 multiplier
    
    // Prefer exercises we've done before (familiarity) but not too recently
    const score = difficulty - fatiguePenalty + (exLogs.length > 0 ? 0.2 : 0);
    return { ...ex, score, logs: exLogs };
  });
  
  // Sort by score (ascending - easier first)
  scored.sort((a, b) => a.score - b.score);
  
  return scored.slice(0, 5); // Top 5 exercises
}
