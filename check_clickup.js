const API_TOKEN = 'pk_306777589_KZKIDKJHJIP0YC65PFPJZZ385KUDUQXU';
const LIST_ID = '901817189531'; // CAPEX Gantt 2026 List ID from clickup.ts

async function checkClickUp() {
  try {
    console.log(`Fetching tasks from ClickUp List: ${LIST_ID}...`);
    const response = await fetch(`https://api.clickup.com/api/v2/list/${LIST_ID}/task?include_closed=true&subtasks=true`, {
      headers: { 'Authorization': API_TOKEN }
    });
    const data = await response.json();
    const tasks = data.tasks || [];
    console.log(`Total ClickUp Tasks: ${tasks.length}`);
    if (tasks.length > 0) {
      console.log('Sample Tasks:', tasks.slice(0, 3).map(t => t.name));
    }
  } catch (err) {
    console.error('ClickUp check failed:', err.message);
  }
}

checkClickUp();
