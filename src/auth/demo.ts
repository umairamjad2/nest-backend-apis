import { TaskPriority, TaskStatus } from '../generated/prisma/enums.js';

// Demo accounts: "Try demo" on the frontend creates a fresh, throwaway user with
// sample tasks, so visitors can look around without registering. Each visitor
// gets their own account, so visitors never see or change each other's tasks.

/** `.invalid` is a reserved domain, so no email can ever be delivered to it. */
export const DEMO_EMAIL_DOMAIN = 'demo.tasknest.invalid';

/** Demo accounts older than this are deleted the next time someone starts a demo. */
export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

/** Refuse new demos past this many live demo accounts (protects the database from spam). */
export const MAX_ACTIVE_DEMOS = 200;

export function isDemoEmail(email: string) {
  return email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/** Midnight UTC, `offset` days from today (how the API stores due dates). */
function day(offset: number, now: Date) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

/** Sample tasks covering every status, priority and due-date state. */
export function demoTasks(now = new Date()) {
  const { TODO, IN_PROGRESS, DONE } = TaskStatus;
  const { LOW, MEDIUM, HIGH } = TaskPriority;

  return [
    { title: 'Fix the login redirect bug', description: 'Users land on the home page instead of where they started.', status: TODO, priority: HIGH, dueDate: day(-1, now) },
    { title: 'Finish the landing page', description: 'Hero, features section and footer.', status: IN_PROGRESS, priority: HIGH, dueDate: day(0, now) },
    { title: 'Review open pull requests', description: null, status: IN_PROGRESS, priority: MEDIUM, dueDate: day(1, now) },
    { title: 'Write API docs for /tasks', description: 'Document the filters, sorting and pagination.', status: TODO, priority: MEDIUM, dueDate: day(3, now) },
    { title: 'Set up CI on GitHub Actions', description: 'Run lint, type check and tests on every PR.', status: TODO, priority: LOW, dueDate: day(7, now) },
    { title: 'Plan the next sprint', description: null, status: TODO, priority: LOW, dueDate: null },
    { title: 'Deploy the backend to Vercel', description: null, status: DONE, priority: HIGH, dueDate: day(-3, now) },
    { title: 'Add dark mode', description: 'Follows the system setting, with a toggle in the navbar.', status: DONE, priority: MEDIUM, dueDate: null },
  ];
}
