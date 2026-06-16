const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const isVercel = process.env.VERCEL === '1';
const DATA_DIR = isVercel ? path.join(require('os').tmpdir(), 'data') : path.join(__dirname, '..', '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Ensure database directory and files exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
}

function readJSON(file) {
  try {
    const content = fs.readFileSync(file, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/**
 * Find user by email.
 */
function findUserByEmail(email) {
  const users = readJSON(USERS_FILE);
  return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Register a new user.
 * Returns the created user object (without password).
 */
async function createUser(name, email, password) {
  const users = readJSON(USERS_FILE);
  const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    throw new Error('User with this email already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: require('uuid').v4(),
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  writeJSON(USERS_FILE, users);

  const { password: _, ...userWithoutPassword } = newUser;
  return userWithoutPassword;
}

/**
 * Authenticate a user.
 * Returns user object (without password) or null.
 */
async function authenticateUser(email, password) {
  const user = findUserByEmail(email);
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

/**
 * Get history items for a user.
 */
function getHistory(userId) {
  const history = readJSON(HISTORY_FILE);
  return history
    .filter(h => h.userId === userId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Get a single history item by Job ID.
 */
function getHistoryItem(jobId) {
  const history = readJSON(HISTORY_FILE);
  return history.find(h => h.jobId === jobId);
}

/**
 * Add a validation job run to history.
 */
function addHistory(jobItem) {
  const history = readJSON(HISTORY_FILE);
  const newItem = {
    ...jobItem,
    timestamp: new Date().toISOString(),
  };
  history.push(newItem);
  writeJSON(HISTORY_FILE, history);
  return newItem;
}

/**
 * Delete a history item.
 */
function deleteHistory(jobId, userId) {
  let history = readJSON(HISTORY_FILE);
  const index = history.findIndex(h => h.jobId === jobId && h.userId === userId);
  
  if (index === -1) {
    return false;
  }
  
  const item = history[index];
  history.splice(index, 1);
  writeJSON(HISTORY_FILE, history);
  return item;
}

module.exports = {
  findUserByEmail,
  createUser,
  authenticateUser,
  getHistory,
  getHistoryItem,
  addHistory,
  deleteHistory,
};
