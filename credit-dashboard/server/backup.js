const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { DB_PATH } = require('./db');

// Root directory of the repository (Beirut/)
const REPO_ROOT = path.resolve(__dirname, '../../');
const BACKUP_DIR = path.join(REPO_ROOT, 'UpData');
const BACKUP_FILE = path.join(BACKUP_DIR, 'beirut.db');

/**
 * Runs a command in the repository root and returns a promise.
 */
function runGitCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd: REPO_ROOT }, (error, stdout, stderr) => {
            if (error) {
                console.error(`[BACKUP-GIT] Error: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                // Some git messages go to stderr even if they aren't errors
                // console.log(`[BACKUP-GIT] Stderr: ${stderr}`);
            }
            resolve(stdout);
        });
    });
}

/**
 * Performs the backup to GitHub:
 * 1. Copies beirut.db to UpData/beirut.db
 * 2. git add, git commit, git push
 */
async function performBackup() {
    console.log(`[BACKUP] Iniciando respaldo automático a GitHub...`);
    
    try {
        // Ensure UpData directory exists
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
            console.log(`[BACKUP] Carpeta 'UpData' creada en ${BACKUP_DIR}`);
        }

        // Copy the DB file
        if (fs.existsSync(DB_PATH)) {
            fs.copyFileSync(DB_PATH, BACKUP_FILE);
            // console.log(`[BACKUP] Base de datos copiada a ${BACKUP_FILE}`);
        } else {
            console.warn(`[BACKUP] No se encontró el archivo de base de datos en ${DB_PATH}`);
            return;
        }

        const timestamp = new Date().toLocaleString();
        
        // Git operations
        await runGitCommand('git add UpData/beirut.db');
        
        // Check if there are changes to commit
        const status = await runGitCommand('git status --porcelain UpData/beirut.db');
        if (!status) {
            console.log(`[BACKUP] No hay cambios en la base de datos para respaldar.`);
            return;
        }

        await runGitCommand(`git commit -m "Backup Automático: ${timestamp}"`);
        await runGitCommand('git push origin main');
        
        console.log(`[BACKUP] ✅ Respaldo completado exitosamente: ${timestamp}`);
    } catch (err) {
        console.error(`[BACKUP] ❌ Falló el respaldo automático:`, err.message);
    }
}

/**
 * Starts the backup service with the specified interval in minutes.
 */
function startBackupService(intervalMinutes = 10) {
    console.log(`[BACKUP] Servicio de respaldo iniciado (cada ${intervalMinutes} minutos)`);
    
    // Initial backup after 1 minute to avoid blocking server start
    setTimeout(performBackup, 60000);
    
    // Periodic backup
    setInterval(performBackup, intervalMinutes * 60 * 1000);
}

module.exports = { startBackupService, performBackup };
