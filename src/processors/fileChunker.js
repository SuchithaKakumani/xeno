const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { writeCSV } = require('./csvProcessor');

/**
 * Splits a dataset into chunks of configurable size.
 * Returns array of { filename, rowCount, filePath }.
 */
async function chunkData(headers, data, outputDir, baseName, chunkSize = 1000) {
  const chunks = [];
  const totalChunks = Math.ceil(data.length / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, data.length);
    const chunkData = data.slice(start, end);

    const filename = `${baseName}_chunk_${i + 1}_of_${totalChunks}.csv`;
    const filePath = path.join(outputDir, filename);

    await writeCSV(filePath, headers, chunkData);

    chunks.push({
      filename,
      filePath,
      rowCount: chunkData.length,
      chunkIndex: i + 1,
      totalChunks,
    });
  }

  return chunks;
}

/**
 * Creates a ZIP archive of all chunk files.
 * Returns the zip file path.
 */
function createChunkZip(chunks, outputDir, baseName) {
  return new Promise((resolve, reject) => {
    const zipPath = path.join(outputDir, `${baseName}_chunks.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);

    archive.pipe(output);

    for (const chunk of chunks) {
      archive.file(chunk.filePath, { name: chunk.filename });
    }

    archive.finalize();
  });
}

module.exports = { chunkData, createChunkZip };
