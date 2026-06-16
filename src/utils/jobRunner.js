const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const db = require('./db');
const { parseCSV, writeCSV } = require('../processors/csvProcessor');
const { runValidationAsync } = require('../validators/validationEngine');
const { cleanData, generateReport } = require('../processors/dataCleaner');
const { chunkData, createChunkZip } = require('../processors/fileChunker');

const jobs = new Map();

/**
 * Creates a new job in the registry.
 */
function createJob(userId, filename) {
  const jobId = uuidv4();
  const job = {
    id: jobId,
    userId: userId || null,
    filename,
    status: 'pending',
    progress: 0,
    result: null,
    error: null,
    clients: [],
  };
  jobs.set(jobId, job);
  return job;
}

/**
 * Gets a job by ID.
 */
function getJob(jobId) {
  return jobs.get(jobId);
}

/**
 * Broadcasts progress update to all SSE clients listening to this job.
 */
function broadcast(job) {
  const data = {
    jobId: job.id,
    status: job.status,
    progress: Math.round(job.progress),
    error: job.error,
    result: job.result,
  };

  logger.debug(`Job ${job.id} progress: ${job.progress}% (${job.status})`);

  job.clients.forEach(client => {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  // Clean up client connections if job is done
  if (['completed', 'failed'].includes(job.status)) {
    job.clients.forEach(client => {
      try {
        client.end();
      } catch (e) {
        // ignore
      }
    });
    job.clients = [];
  }
}

/**
 * Adds an SSE response connection to a job.
 */
function addClient(jobId, res) {
  const job = jobs.get(jobId);
  if (!job) {
    res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
    res.end();
    return;
  }

  job.clients.push(res);

  // Send current status immediately
  const initialData = {
    jobId: job.id,
    status: job.status,
    progress: Math.round(job.progress),
    error: job.error,
    result: job.result,
  };
  res.write(`data: ${JSON.stringify(initialData)}\n\n`);

  if (['completed', 'failed'].includes(job.status)) {
    res.end();
    // Remove client
    job.clients = job.clients.filter(c => c !== res);
  }
}

/**
 * Starts execution of a validation job.
 */
async function startJob(jobId, filePath, outputDir, options = {}) {
  const job = jobs.get(jobId);
  if (!job) return;

  const chunkSize = parseInt(options.chunkSize) || 1000;

  try {
    // 1. Parsing
    job.status = 'parsing';
    job.progress = 10;
    broadcast(job);

    const { headers, data } = await parseCSV(filePath);
    
    if (data.length === 0) {
      throw new Error('CSV file is empty (no data rows found)');
    }

    // 2. Validating
    job.status = 'validating';
    job.progress = 20;
    broadcast(job);

    const validationResult = await runValidationAsync(data, headers, (current, total) => {
      // Scale validation progress from 20% to 60%
      job.progress = 20 + ((current / total) * 40);
      broadcast(job);
    });

    // 3. Normalizing / Cleaning
    job.status = 'cleaning';
    job.progress = 65;
    broadcast(job);
    const cleaningResult = cleanData(validationResult.cleanedData, headers);
    
    // 4. Exporting / Chunking
    job.status = 'saving';
    job.progress = 80;
    broadcast(job);

    const sessionId = uuidv4();
    const sessionDir = path.join(outputDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    // Write primary cleaned CSV
    const cleanedFilename = `validated_${path.parse(job.filename).name}.csv`;
    const cleanedPath = path.join(sessionDir, cleanedFilename);
    await writeCSV(cleanedPath, headers, cleaningResult.data);

    // Chunk if necessary
    let chunkInfo = null;
    if (cleaningResult.data.length > chunkSize) {
      const baseName = path.parse(job.filename).name;
      const chunks = await chunkData(headers, cleaningResult.data, sessionDir, baseName, chunkSize);
      const zipPath = await createChunkZip(chunks, sessionDir, baseName);

      chunkInfo = {
        totalChunks: chunks.length,
        chunkSize,
        chunks: chunks.map(c => ({
          filename: c.filename,
          rowCount: c.rowCount,
          downloadUrl: `/api/download/${sessionId}/${c.filename}`,
        })),
        zipDownloadUrl: `/api/download/${sessionId}/${path.basename(zipPath)}`,
      };
    }

    // Generate validation report
    const report = generateReport(validationResult, cleaningResult, chunkInfo);
    const reportPath = path.join(sessionDir, 'validation_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Cleanup temp upload file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Job result details
    const result = {
      sessionId,
      summary: validationResult.summary,
      errors: validationResult.errors.slice(0, 500), // Cap at 500 for response size
      warnings: validationResult.warnings.slice(0, 500),
      totalErrors: validationResult.errors.length,
      totalWarnings: validationResult.warnings.length,
      cleaning: {
        duplicatesRemoved: cleaningResult.duplicatesRemoved,
        finalRowCount: cleaningResult.cleanedCount,
      },
      downloads: {
        cleanedFile: `/api/download/${sessionId}/${cleanedFilename}`,
        report: `/api/download/${sessionId}/validation_report.json`,
      },
      chunking: chunkInfo,
    };

    // Save to user history if user is authenticated
    if (job.userId) {
      db.addHistory({
        userId: job.userId,
        jobId: job.id,
        filename: job.filename,
        sessionId,
        summary: {
          totalRows: validationResult.summary.totalRows,
          validRows: validationResult.summary.validRows,
          errorRows: validationResult.summary.errorRows,
          warningRows: validationResult.summary.warningRows,
        },
        downloads: result.downloads,
        chunking: chunkInfo ? { totalChunks: chunkInfo.totalChunks } : null,
      });
      logger.info(`Saved job ${job.id} to history for user ${job.userId}`);
    }

    job.status = 'completed';
    job.progress = 100;
    job.result = result;
    broadcast(job);

  } catch (err) {
    logger.error(`Error processing job ${jobId}: ${err.message}`, { stack: err.stack });
    
    // Cleanup temp upload file on failure
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        // ignore
      }
    }

    job.status = 'failed';
    job.error = err.message || 'An error occurred during data processing';
    broadcast(job);
  }
}

module.exports = {
  createJob,
  getJob,
  addClient,
  startJob,
};
