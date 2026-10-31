import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import { fetchExercises } from './services/wger';
import { 
  getMuscleCategory, 
  calculateMuscleFatigue, 
  selectMuscleGroups,
  selectExercisesForMuscleGroup,
  suggestWeight 
} from './services/workoutAlgorithm';
import { getOrCreateUser, getWorkouts, createWorkout, getAllExercises, getPersonalRecords, syncExercises } from './services/supabase';

function App() {
  const [telegramId, setTelegramId] = useState(localStorage.getItem('telegramId') || '');
  const [user, setUser] = useState(null);
  const [view, setView] = useState('setup');
  const [loading, setLoading] = useState(false);
  const [exercises, setExercises] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [personalRecords, setPersonalRecords] = useState([]);

  useEffect(() => {
    if (telegramId) {
      loadUser();
    }
  }, [telegramId]);

  const loadUser = async () => {
    setLoading(true);
    try {
      const userData = await getOrCreateUser(telegramId);
      setUser(userData);
      setView('generate');
      await loadExercises();
      await loadWorkouts(userData.id);
      await loadProgress(userData.id);
    } catch (err) {
      console.error('Failed to load user:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadExercises = async () => {
    try {
      const data = await getAllExercises();
      if (data.length === 0) {
        const wgerExercises = await fetchExercises();
        await syncExercises(wgerExercises);
        setExercises(wgerExercises);
      } else {
        setExercises(data);
      }
    } catch (err) {
      console.error('Failed to load exercises:', err);
    }
  };

  const loadWorkouts = async (profileId) => {
    try {
      const data = await getWorkouts(profileId);
      setWorkouts(data);
    } catch (err) {
      console.error('Failed to load workouts:', err);
    }
  };

  const loadProgress = async (profileId) => {
    try {
      const data = await getPersonalRecords(profileId);
      setPersonalRecords(data);
    } catch (err) {
      console.error('Failed to load progress:', err);
    }
  };

  const handleSetup = (e) => {
    e.preventDefault();
    localStorage.setItem('telegramId', telegramId);
    loadUser();
  };

  if (view === 'setup') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-2">💪 Fitbod Clone</h1>
          <p className="text-gray-600 text-center mb-8">Enter your Telegram ID to get started</p>
          <form onSubmit={handleSetup} className="space-y-4">
            <input
              type="text"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              placeholder="Telegram ID"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white p-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">💪 Fitbod Clone</h1>
          <span className="text-sm opacity-80">@{user?.username}</span>
        </div>
      </header>

      <nav className="bg-white border-b sticky top-16 z-10">
        <div className="max-w-2xl mx-auto flex">
          {['generate', 'history', 'progress'].map((tab) => (
            <button
              key={tab}
              onClick={() => setView(tab)}
              className={`flex-1 py-3 text-sm font-medium capitalize ${
                view === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-2xl mx-auto p-4">
        {view === 'generate' && (
          <GenerateWorkout 
            user={user} 
            exercises={exercises} 
            workouts={workouts}
            onWorkoutLogged={() => {
              loadWorkouts(user.id);
              loadProgress(user.id);
            }}
          />
        )}
        {view === 'history' && (
          <History workouts={workouts} />
        )}
        {view === 'progress' && (
          <Progress records={personalRecords} exercises={exercises} />
        )}
      </main>
    </div>
  );
}

function GenerateWorkout({ user, exercises, workouts, onWorkoutLogged }) {
  const [focus, setFocus] = useState('full_body');
  const [difficulty, setDifficulty] = useState('moderate');
  const [equipment, setEquipment] = useState('any');
  const [generated, setGenerated] = useState(null);
  const [loading, setLoading] = useState(false);

  const muscleGroups = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const fatigueMap = {};
      muscleGroups.forEach(group => {
        fatigueMap[group] = calculateMuscleFatigue(workouts, group);
      });

      const selectedGroups = selectMuscleGroups(fatigueMap, focus === 'full_body' ? 3 : 1);

      const selectedExercises = [];
      selectedGroups.forEach(group => {
        const fatigue = fatigueMap[group];
        const groupExercises = selectExercisesForMuscleGroup(
          exercises, 
          group, 
          equipment, 
          [], 
          fatigue
        );
        selectedExercises.push(...groupExercises.slice(0, 2));
      });

      const workoutExercises = selectedExercises.map(ex => {
        const exLogs = workouts
          .flatMap(w => w.workout_exercises || [])
          .filter(we => we.exercise_id === ex.id)
          .flatMap(we => we.exercise_logs || []);
        
        const suggestedWeight = suggestWeight(exLogs, ex.default_weight || 0);
        
        return {
          exercise_id: ex.id,
          name: ex.name,
          muscle_group: getMuscleCategory(ex.muscle_name || ''),
          sets: 3,
          reps: ex.default_reps || 10,
          weight: suggestedWeight,
        };
      });

      setGenerated({
        name: `${focus.replace('_', ' ')} Workout`,
        exercises: workoutExercises,
      });
    } catch (err) {
      console.error('Failed to generate workout:', err);
      alert('Failed to generate workout');
    } finally {
      setLoading(false);
    }
  };

  const handleLog = async () => {
    if (!generated) return;
    
    setLoading(true);
    try {
      await createWorkout(user.id, generated);
      onWorkoutLogged();
      setGenerated(null);
      alert('Workout logged!');
    } catch (err) {
      console.error('Failed to log workout:', err);
      alert('Failed to log workout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-4">Generate Workout</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Focus</label>
            <select
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="full_body">Full Body</option>
              {muscleGroups.map(group => (
                <option key={group} value={group}>{group.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="easy">Easy</option>
              <option value="moderate">Moderate</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Equipment</label>
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="any">Any</option>
              <option value="barbell">Barbell</option>
              <option value="dumbbell">Dumbbell</option>
              <option value="machine">Machine</option>
              <option value="bodyweight">Bodyweight</option>
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Workout'}
          </button>
        </div>
      </div>

      {generated && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-4">{generated.name}</h3>
          <div className="space-y-3">
            {generated.exercises.map((ex, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <div className="font-semibold">{idx + 1}. {ex.name}</div>
                <div className="text-sm text-gray-600">{ex.muscle_group}</div>
                <div className="text-sm text-gray-600">{ex.sets} sets × {ex.reps} reps @ {ex.weight} lbs</div>
              </div>
            ))}
          </div>
          <button
            onClick={handleLog}
            disabled={loading}
            className="w-full mt-4 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            Log as Completed
          </button>
        </div>
      )}
    </div>
  );
}

function History({ workouts }) {
  if (workouts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg mb-2">No workouts yet</p>
        <p>Generate your first workout to get started!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {workouts.map((workout) => (
        <div key={workout.id} className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold">{workout.name}</h3>
            <span className="text-sm text-gray-500">
              {new Date(workout.date).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            {workout.workout_exercises?.length || 0} exercises
          </p>
        </div>
      ))}
    </div>
  );
}

function Progress({ records, exercises }) {
  if (records.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg mb-2">No progress data yet</p>
        <p>Complete some workouts to track your PRs!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <div key={record.id} className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold mb-1">
            {record.exercise?.name || 'Unknown Exercise'}
          </h3>
          <p className="text-sm text-gray-600">
            {record.max_weight} lbs × {record.max_reps_at_weight} reps
          </p>
          <p className="text-sm font-medium text-blue-600">
            Est. 1RM: {record.estimated_1rm} lbs
          </p>
        </div>
      ))}
    </div>
  );
}

export default App;
