const WGER_API = 'https://wger.de/api/v2';

export async function fetchExercises() {
  const response = await fetch(`${WGER_API}/exercise/?limit=500&language=2`);
  if (!response.ok) throw new Error('Failed to fetch exercises from Wger');
  const data = await response.json();
  return data.results || [];
}

export async function fetchExerciseDetails(id) {
  const response = await fetch(`${WGER_API}/exercise/${id}/?language=2`);
  if (!response.ok) throw new Error(`Failed to fetch exercise ${id}`);
  return await response.json();
}

export async function fetchMuscles() {
  const response = await fetch(`${WGER_API}/muscle/?limit=100`);
  if (!response.ok) throw new Error('Failed to fetch muscles');
  return await response.json();
}
