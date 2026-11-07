/**
 * Script para asignar roles (Custom Claims) a usuarios de Firebase Auth.
 * Uso: node scripts/set-user-role.js <email> <role>
 * Roles: admin | operador | viewer
 *
 * Requiere: Firebase Admin SDK configurado con Service Account.
 * Coloca tu service-account.json en la raíz (NO commitear) o usa GOOGLE_APPLICATION_CREDENTIALS.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar service account (desde archivo local o env)
let serviceAccount;
try {
    const saPath = join(__dirname, '..', 'service-account.json');
    serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'));
} catch {
    console.error('❌ No se encontró service-account.json en la raíz del proyecto.');
    console.error('   Descárgalo de Firebase Console > Project Settings > Service Accounts > Generate new private key');
    console.error('   Guárdalo como service-account.json (NO commitear, está en .gitignore)');
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();

const ROLES_VALIDOS = Object.freeze(['admin', 'operador', 'viewer']);

async function setUserRole(email, role) {
    if (!ROLES_VALIDOS.includes(role)) {
        console.error(`❌ Rol inválido: ${role}. Usa: ${ROLES_VALIDOS.join(', ')}`);
        process.exit(1);
    }

    try {
        const user = await auth.getUserByEmail(email);
        console.log(`👤 Usuario encontrado: ${user.email} (UID: ${user.uid})`);

        const claims = { admin: false, operador: false, viewer: false };
        claims[role] = true;

        await auth.setCustomUserClaims(user.uid, claims);
        console.log(`✅ Custom claims actualizados:`, claims);

        // Verificar
        const updated = await auth.getUser(user.uid);
        console.log(`🔍 Claims actuales:`, updated.customClaims);

        console.log('\n⚠️  El usuario debe **cerrar sesión y volver a entrar** para que los claims tomen efecto.');
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.error(`❌ Usuario no encontrado: ${email}`);
        } else {
            console.error('❌ Error:', error.message);
        }
        process.exit(1);
    }
}

// CLI
const [,, email, role] = process.argv;
if (!email || !role) {
    console.log('Uso: node scripts/set-user-role.js <email> <admin|operador|viewer>');
    console.log('Ejemplo: node scripts/set-user-role.js director@escuela.edu.ar admin');
    process.exit(1);
}

setUserRole(email, role);