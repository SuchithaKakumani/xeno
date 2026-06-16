const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Set VERCEL to '1' so that server.js does not start listening and supertest can run cleanly
process.env.VERCEL = '1';
process.env.PORT = 0;
const app = require('../server');
const db = require('../src/utils/db');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

describe('Authentication & History API Integration', () => {
  let usersBackup = '';
  let historyBackup = '';
  let serverInstance;

  describe('GET /login', () => {
    test('should return the static login page HTML', async () => {
      const res = await request(app).get('/login');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('Sign In — XenoValidator');
    });
  });


  beforeAll((done) => {
    // Backup db files
    if (fs.existsSync(USERS_FILE)) {
      usersBackup = fs.readFileSync(USERS_FILE, 'utf-8');
    }
    if (fs.existsSync(HISTORY_FILE)) {
      historyBackup = fs.readFileSync(HISTORY_FILE, 'utf-8');
    }

    // Start server to get a handler if needed, but supertest does this.
    // However, server.js starts automatically unless isVercel is true.
    // If server.js is listening, we save a handle to close it later.
    done();
  });

  afterAll((done) => {
    // Restore db files
    if (usersBackup) {
      fs.writeFileSync(USERS_FILE, usersBackup);
    }
    if (historyBackup) {
      fs.writeFileSync(HISTORY_FILE, historyBackup);
    }
    
    // Close the Express server listener if it's running to prevent Jest open handles
    // Since server.js calls app.listen asynchronously on import, we find the server handle.
    // Usually it is started automatically, we can close it if we can access the listener.
    // In server.js: module.exports = app;
    // We can also run an active close on the server.
    done();
  });

  const testUser = {
    name: 'Test Jest User',
    email: 'jest.test@example.com',
    password: 'Password123'
  };

  let authCookie = '';

  describe('POST /api/auth/register', () => {
    test('should register a new user successfully', async () => {
      // Clear user if it exists in backup
      const users = JSON.parse(usersBackup || '[]');
      const filtered = users.filter(u => u.email !== testUser.email);
      fs.writeFileSync(USERS_FILE, JSON.stringify(filtered, null, 2));

      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(testUser.name);
      expect(res.body.email).toBe(testUser.email);
      expect(res.body).not.toHaveProperty('password');
    });

    test('should fail to register user with same email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('should fail if required fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: testUser.email });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login user and return cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(testUser.email);
      
      // Save cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      authCookie = cookies.find(c => c.startsWith('token='));
      expect(authCookie).toBeDefined();
    });

    test('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword'
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/auth/me', () => {
    test('should return profile for authenticated user', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(testUser.email);
    });

    test('should reject unauthenticated request', async () => {
      const res = await request(app)
        .get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('History Endpoints & Access Control', () => {
    test('GET /api/validate/history should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/validate/history');
      expect(res.status).toBe(401);
    });

    test('GET /api/validate/history should return empty history array initially', async () => {
      // Clear history file for test
      fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));

      const res = await request(app)
        .get('/api/validate/history')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    test('should retrieve user history after adding an item', async () => {
      // Get user ID
      const user = db.findUserByEmail(testUser.email);
      expect(user).toBeDefined();

      const testJob = {
        userId: user.id,
        jobId: 'test-job-uuid-123',
        filename: 'transactions.csv',
        sessionId: 'session-uuid-456',
        summary: {
          totalRows: 100,
          validRows: 80,
          errorRows: 10,
          warningRows: 10
        },
        downloads: {
          cleanedFile: '/api/download/session-uuid-456/cleaned.csv',
          report: '/api/download/session-uuid-456/report.json'
        },
        chunking: null
      };

      db.addHistory(testJob);

      const res = await request(app)
        .get('/api/validate/history')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].jobId).toBe(testJob.jobId);
      expect(res.body[0].filename).toBe(testJob.filename);
    });

    test('DELETE /api/validate/history/:jobId should delete history item', async () => {
      const res = await request(app)
        .delete('/api/validate/history/test-job-uuid-123')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      
      // Check it's gone
      const historyRes = await request(app)
        .get('/api/validate/history')
        .set('Cookie', [authCookie]);

      expect(historyRes.body.length).toBe(0);
    });
  });

  describe('POST /api/auth/logout', () => {
    test('should clear auth cookie', async () => {
      const res = await request(app)
        .post('/api/auth/logout');

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      // The cookie should be expired/cleared
      expect(cookies).toBeDefined();
      const clearedCookie = cookies.find(c => c.startsWith('token='));
      expect(clearedCookie).toBeDefined();
      const lowerCookie = clearedCookie.toLowerCase();
      const containsExpiry = lowerCookie.includes('max-age=0') || lowerCookie.includes('expires=');
      expect(containsExpiry).toBe(true);
    });
  });
});
