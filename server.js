        const userId = await createUserInSheet({ name, email, phone, password });
        
        // Enviar email de bienvenida
        const welcomeEmail = {
            from: `"Salón de Belleza 💇‍♀️" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '¡Bienvenid@ a Salón de Belleza! 🎉',
            html: `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Arial', 'Helvetica', sans-serif; background-color: #f4f4f4;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4; padding: 40px 0;">
        <tr>
            <td align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #ff6b9d 0%, #c471ed 100%); padding: 50px 30px; text-align: center;">
                            <div style="font-size: 80px; margin-bottom: 20px;">🎉</div>
                            <h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 700;">¡Bienvenid@!</h1>
                            <p style="color: rgba(255,255,255,0.95); margin: 15px 0 0 0; font-size: 18px;">Has creado tu cuenta exitosamente</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 35px;">
                            
                            <h2 style="color: #2d3748; font-size: 24px; font-weight: 700; margin: 0 0 15px 0;">Hola, ${name} 👋</h2>
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                                Estamos encantados de tenerte con nosotros. Ahora puedes disfrutar de todos estos beneficios:
                            </p>
                            
                            <!-- Benefits -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                                <tr>
                                    <td style="padding: 15px 0;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="width: 50px; vertical-align: top;">
                                                    <div style="width: 45px; height: 45px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;">📅</div>
                                                </td>
                                                <td style="padding-left: 15px;">
                                                    <p style="margin: 0 0 5px 0; color: #2d3748; font-size: 16px; font-weight: 700;">Reservas 24/7</p>
                                                    <p style="margin: 0; color: #718096; font-size: 14px; line-height: 1.5;">Agenda tu cita en cualquier momento</pconst express = require('express');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cors());

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ===== GOOGLE AUTH SETUP =====
let auth, sheets, calendar;

try {
    console.log('✅ Inicializando OAuth 2.0...');
    
    const oauth2Client = new google.auth.OAuth2(
        process.env.OAUTH_CLIENT_ID,
        process.env.OAUTH_CLIENT_SECRET,
        'urn:ietf:wg:oauth:2.0:oob'
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.OAUTH_REFRESH_TOKEN
    });

    auth = oauth2Client;
    sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    console.log('✅ OAuth 2.0 configurado');
} catch (error) {
    console.error('❌ Error configurando autenticación:', error.message);
    process.exit(1);
}

const SHEET_ID = process.env.SHEET_ID;
const CALENDAR_ID = process.env.CALENDAR_ID;
const CALENDAR_OWNER_EMAIL = process.env.CALENDAR_OWNER_EMAIL;

// Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ===== SERVICE CONFIG =====
const services = {
    corte: { name: 'Corte de Pelo', duration: 45, price: 25 },
    tinte: { name: 'Tinte', duration: 120, price: 60 },
    mechas: { name: 'Mechas', duration: 150, price: 80 },
    peinado: { name: 'Peinado', duration: 60, price: 35 },
    tratamiento: { name: 'Tratamiento Capilar', duration: 90, price: 45 },
    manicura: { name: 'Manicura', duration: 45, price: 20 }
};

// ===== HELPER FUNCTIONS =====
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function getUserFromSheet(email) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Usuarios!A:G',
        });

        const rows = response.data.values || [];
        const userRow = rows.find(row => row[2] === email); // Email en columna C

        if (userRow) {
            return {
                id: userRow[0],
                name: userRow[1],
                email: userRow[2],
                phone: userRow[3],
                passwordHash: userRow[4],
                createdAt: userRow[5],
                appointmentCount: parseInt(userRow[6] || '0')
            };
        }
        return null;
    } catch (error) {
        console.error('Error buscando usuario:', error);
        return null;
    }
}

async function getUserById(userId) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Usuarios!A:G',
        });

        const rows = response.data.values || [];
        const userRow = rows.find(row => row[0] === userId);

        if (userRow) {
            return {
                id: userRow[0],
                name: userRow[1],
                email: userRow[2],
                phone: userRow[3],
                passwordHash: userRow[4],
                createdAt: userRow[5],
                appointmentCount: parseInt(userRow[6] || '0')
            };
        }
        return null;
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        return null;
    }
}

async function createUserInSheet(userData) {
    try {
        const userId = crypto.randomBytes(16).toString('hex');
        const row = [
            userId,
            userData.name,
            userData.email,
            userData.phone,
            hashPassword(userData.password),
            new Date().toISOString(),
            '0' // appointmentCount inicial
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Usuarios!A:G',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [row] }
        });

        return userId;
    } catch (error) {
        console.error('Error creando usuario:', error);
        throw error;
    }
}

async function updateUserAppointmentCount(userId, newCount) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Usuarios!A:G',
        });

        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => row[0] === userId);

        if (rowIndex !== -1) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `Usuarios!G${rowIndex + 1}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[newCount.toString()]] }
            });
        }
    } catch (error) {
        console.error('Error actualizando contador:', error);
    }
}

async function getUserAppointments(userId) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Reservas!A:J',
        });

        const rows = response.data.values || [];
        const appointments = rows
            .filter(row => row[9] === userId) // userId en columna J
            .map(row => ({
                id: row[0],
                service: row[5],
                date: row[7],
                duration: row[6],
                price: row[8]
            }));

        return appointments;
    } catch (error) {
        console.error('Error obteniendo citas:', error);
        return [];
    }
}

// ===== AUTH ENDPOINTS =====
app.post('/auth/register', async (req, res) => {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
        return res.json({ success: false, message: 'Faltan campos requeridos' });
    }

    try {
        const existingUser = await getUserFromSheet(email);
        
        if (existingUser) {
            return res.json({ success: false, message: 'El email ya está registrado' });
        }

        const userId = await createUserInSheet({ name, email, phone, password });
        
        // Enviar email de bienvenida
        const welcomeEmail = {
            from: `"Salón de Belleza 💇‍♀️" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '¡Bienvenid@ a Salón de Belleza! 🎉',
            html: `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Arial', 'Helvetica', sans-serif; background-color: #f4f4f4;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4; padding: 40px 0;">
        <tr>
            <td align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #ff6b9d 0%, #c471ed 100%); padding: 50px 30px; text-align: center;">
                            <div style="font-size: 80px; margin-bottom: 20px;">🎉</div>
                            <h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 700;">¡Bienvenid@!</h1>
                            <p style="color: rgba(255,255,255,0.95); margin: 15px 0 0 0; font-size: 18px;">Has creado tu cuenta exitosamente</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 35px;">
                            
                            <h2 style="color: #2d3748; font-size: 24px; font-weight: 700; margin: 0 0 15px 0;">Hola, ${name} 👋</h2>
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                                Estamos encantados de tenerte con nosotros. Ahora puedes disfrutar de todos estos beneficios:
                            </p>
                            
                            <!-- Benefits -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                                <tr>
                                    <td style="padding: 15px 0;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="width: 50px; vertical-align: top;">
                                                    <div style="width: 45px; height: 45px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;">📅</div>
                                                </td>
                                                <td style="padding-left: 15px;">
                                                    <p style="margin: 0 0 5px 0; color: #2d3748; font-size: 16px; font-weight: 700;">Reservas 24/7</p>
                                                    <p style="margin: 0; color: #718096; font-size: 14px; line-height: 1.5;">Agenda tu cita en cualquier momento del día</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 15px 0;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="width: 50px; vertical-align: top;">
                                                    <div style="width: 45px; height: 45px; background: linear-gradient(135deg, #11998e, #38ef7d); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;">🎁</div>
                                                </td>
                                                <td style="padding-left: 15px;">
                                                    <p style="margin: 0 0 5px 0; color: #2d3748; font-size: 16px; font-weight: 700;">Descuento especial</p>
                                                    <p style="margin: 0; color: #718096; font-size: 14px; line-height: 1.5;">2€ de descuento desde tu segunda cita</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 15px 0;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="width: 50px; vertical-align: top;">
                                                    <div style="width: 45px; height: 45px; background: linear-gradient(135deg, #ff6b9d, #c471ed); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;">📱</div>
                                                </td>
                                                <td style="padding-left: 15px;">
                                                    <p style="margin: 0 0 5px 0; color: #2d3748; font-size: 16px; font-weight: 700;">Gestiona tus citas</p>
                                                    <p style="margin: 0; color: #718096; font-size: 14px; line-height: 1.5;">Visualiza y controla todas tus reservas</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 15px 0;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="width: 50px; vertical-align: top;">
                                                    <div style="width: 45px; height: 45px; background: linear-gradient(135deg, #12c2e9, #0093E9); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;">🔔</div>
                                                </td>
                                                <td style="padding-left: 15px;">
                                                    <p style="margin: 0 0 5px 0; color: #2d3748; font-size: 16px; font-weight: 700;">Recordatorios automáticos</p>
                                                    <p style="margin: 0; color: #718096; font-size: 14px; line-height: 1.5;">Nunca olvides una cita con nuestras notificaciones</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Services Preview -->
                            <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-radius: 12px; padding: 25px; margin-bottom: 30px;">
                                <h3 style="color: #2d3748; font-size: 18px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">✨ Nuestros Servicios</h3>
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                    <tr>
                                        <td style="text-align: center; padding: 10px;">
                                            <div style="font-size: 32px; margin-bottom: 8px;">✂️</div>
                                            <p style="margin: 0; color: #4a5568; font-size: 13px; font-weight: 600;">Corte</p>
                                        </td>
                                        <td style="text-align: center; padding: 10px;">
                                            <div style="font-size: 32px; margin-bottom: 8px;">🎨</div>
                                            <p style="margin: 0; color: #4a5568; font-size: 13px; font-weight: 600;">Tinte</p>
                                        </td>
                                        <td style="text-align: center; padding: 10px;">
                                            <div style="font-size: 32px; margin-bottom: 8px;">✨</div>
                                            <p style="margin: 0; color: #4a5568; font-size: 13px; font-weight: 600;">Mechas</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="text-align: center; padding: 10px;">
                                            <div style="font-size: 32px; margin-bottom: 8px;">💆‍♀️</div>
                                            <p style="margin: 0; color: #4a5568; font-size: 13px; font-weight: 600;">Peinado</p>
                                        </td>
                                        <td style="text-align: center; padding: 10px;">
                                            <div style="font-size: 32px; margin-bottom: 8px;">🌿</div>
                                            <p style="margin: 0; color: #4a5568; font-size: 13px; font-weight: 600;">Tratamiento</p>
                                        </td>
                                        <td style="text-align: center; padding: 10px;">
                                            <div style="font-size: 32px; margin-bottom: 8px;">💅</div>
                                            <p style="margin: 0; color: #4a5568; font-size: 13px; font-weight: 600;">Manicura</p>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                            
                            <!-- Next Steps -->
                            <div style="background-color: #fff7ed; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                                <p style="margin: 0 0 12px 0; color: #92400e; font-size: 15px; font-weight: 700;">🚀 Próximos pasos:</p>
                                <ol style="margin: 0; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.8;">
                                    <li style="margin-bottom: 8px;">Inicia sesión en tu cuenta</li>
                                    <li style="margin-bottom: 8px;">Explora nuestros servicios</li>
                                    <li>¡Reserva tu primera cita!</li>
                                </ol>
                            </div>
                            
                            <!-- Contact -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="text-align: center; padding: 20px 0;">
                                        <p style="margin: 0 0 15px 0; color: #4a5568; font-size: 15px; font-weight: 600;">¿Tienes alguna pregunta?</p>
                                        <a href="tel:644137667" style="display: inline-block; color: #ff6b9d; text-decoration: none; font-size: 18px; font-weight: 700; margin: 0 15px;">
                                            📞 644 137 667
                                        </a>
                                        <a href="mailto:${process.env.EMAIL_USER}" style="display: inline-block; color: #ff6b9d; text-decoration: none; font-size: 15px; font-weight: 600; margin: 0 15px;">
                                            📧 Contáctanos
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #2d3748; padding: 30px; text-align: center;">
                            <div style="font-size: 40px; margin-bottom: 15px;">💇‍♀️</div>
                            <p style="margin: 0 0 10px 0; color: #ffffff; font-size: 18px; font-weight: 700;">Salón de Belleza</p>
                            <p style="margin: 0 0 20px 0; color: #a0aec0; font-size: 14px; font-style: italic;">Tu belleza, nuestra pasión</p>
                            <p style="margin: 0; color: #718096; font-size: 12px;">
                                © ${new Date().getFullYear()} Salón de Belleza. Todos los derechos reservados.
                            </p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            `
        };

        try {
            await transporter.sendMail(welcomeEmail);
            console.log('✅ Email de bienvenida enviado');
        } catch (error) {
            console.error('⚠️ Error enviando email de bienvenida:', error.message);
        }
        
        console.log('✅ Usuario registrado:', email);
        res.json({ success: true, message: 'Usuario creado exitosamente', userId });
    } catch (error) {
        console.error('Error en registro:', error);
        res.json({ success: false, message: 'Error al crear el usuario' });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({ success: false, message: 'Email y contraseña requeridos' });
    }

    try {
        const user = await getUserFromSheet(email);
        
        if (!user) {
            return res.json({ success: false, message: 'Usuario no encontrado' });
        }

        const passwordHash = hashPassword(password);
        
        if (user.passwordHash !== passwordHash) {
            return res.json({ success: false, message: 'Contraseña incorrecta' });
        }

        console.log('✅ Login exitoso:', email);
        res.json({ 
            success: true, 
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                appointmentCount: user.appointmentCount
            }
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.json({ success: false, message: 'Error al iniciar sesión' });
    }
});

app.get('/auth/user/:userId', async (req, res) => {
    try {
        const user = await getUserById(req.params.userId);
        
        if (!user) {
            return res.json({ success: false, message: 'Usuario no encontrado' });
        }

        res.json({ 
            success: true, 
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                appointmentCount: user.appointmentCount
            }
        });
    } catch (error) {
        res.json({ success: false, message: 'Error obteniendo usuario' });
    }
});

// ===== APPOINTMENTS ENDPOINTS =====
app.get('/appointments/:userId', async (req, res) => {
    try {
        const appointments = await getUserAppointments(req.params.userId);
        res.json({ success: true, appointments });
    } catch (error) {
        res.json({ success: false, message: 'Error obteniendo citas' });
    }
});

app.post('/reservar', async (req, res) => {
    const {
        userId,
        date,
        type,
        nombre,
        apellido,
        email,
        telefono,
        discount
    } = req.body;

    console.log('📝 Nueva reserva:', { userId, date, type, email });

    if (!userId || !date || !type || !nombre || !email || !telefono) {
        return res.status(400).json({
            success: false,
            message: 'Faltan campos obligatorios'
        });
    }

    try {
        const service = services[type];
        if (!service) {
            return res.status(400).json({
                success: false,
                message: 'Servicio no válido'
            });
        }

        // Calcular precio con descuento
        const finalPrice = service.price - (discount || 0);

        // Preparar horario
        const [datePart, timePart] = date.split(' ');
        const [hours, minutes] = timePart.split(':').map(Number);
        const dateObj = new Date(datePart);
        dateObj.setHours(hours, minutes, 0, 0);

        const startTime = dateObj;
        const endTime = new Date(startTime.getTime() + service.duration * 60000);

        // Crear evento en Calendar
        console.log('📅 Creando evento en Calendar...');
        const event = {
            summary: `${nombre} ${apellido} - ${service.name}`,
            description: `Servicio: ${service.name}\nDuración: ${service.duration} min\nPrecio: ${finalPrice}€${discount ? ` (Descuento: -${discount}€)` : ''}\nEmail: ${email}\nTeléfono: ${telefono}`,
            start: {
                dateTime: startTime.toISOString(),
                timeZone: 'Europe/Madrid',
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: 'Europe/Madrid',
            },
            attendees: [
                { email: email },
                { email: CALENDAR_OWNER_EMAIL }
            ],
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 },
                    { method: 'popup', minutes: 10 },
                ],
            },
            colorId: '9'
        };

        const calendarEvent = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            resource: event,
            sendNotifications: true,
            sendUpdates: 'all',
        });

        console.log('✅ Evento creado en Calendar');

        // Guardar en Sheets
        console.log('📊 Guardando en Sheets...');
        const appointmentId = crypto.randomBytes(8).toString('hex');
        const row = [
            appointmentId,
            new Date().toISOString(),
            nombre,
            apellido,
            email,
            telefono,
            service.name,
            `${service.duration} min`,
            `${finalPrice}€`,
            startTime.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
            userId,
            calendarEvent.data.htmlLink
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Reservas!A:L',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [row] }
        });

        // Actualizar contador de citas del usuario
        const user = await getUserById(userId);
        if (user) {
            await updateUserAppointmentCount(userId, user.appointmentCount + 1);
        }

        console.log('✅ Datos guardados en Sheets');

        // Enviar email
        const mailOptions = {
            from: `"Salón de Belleza 💇‍♀️" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '✨ Tu cita está confirmada',
            html: `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmación de Cita</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Arial', 'Helvetica', sans-serif; background-color: #f4f4f4;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4; padding: 40px 0;">
        <tr>
            <td align="center">
                <!-- Main Container -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #ff6b9d 0%, #c471ed 100%); padding: 40px 30px; text-align: center;">
                            <div style="font-size: 60px; margin-bottom: 15px;">💇‍♀️</div>
                            <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Salón de Belleza</h1>
                            <p style="color: rgba(255,255,255,0.95); margin: 10px 0 0 0; font-size: 16px; font-weight: 300;">Tu belleza, nuestra pasión</p>
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 40px 35px;">
                            
                            <!-- Greeting -->
                            <h2 style="color: #2d3748; font-size: 24px; font-weight: 700; margin: 0 0 15px 0;">¡Hola, ${nombre}! 👋</h2>
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                                Estamos encantados de confirmar tu cita. A continuación encontrarás todos los detalles:
                            </p>
                            
                            <!-- Appointment Details Card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-radius: 12px; border-left: 5px solid #ff6b9d; margin-bottom: 30px;">
                                <tr>
                                    <td style="padding: 25px;">
                                        
                                        <!-- Service -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 15px;">
                                            <tr>
                                                <td style="width: 40px; vertical-align: top;">
                                                    <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #ff6b9d, #c471ed); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px;">✨</div>
                                                </td>
                                                <td style="padding-left: 15px;">
                                                    <p style="margin: 0; color: #718096; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Servicio</p>
                                                    <p style="margin: 5px 0 0 0; color: #2d3748; font-size: 18px; font-weight: 700;">${service.name}</p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Date & Time -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 15px;">
                                            <tr>
                                                <td style="width: 40px; vertical-align: top;">
                                                    <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px;">📅</div>
                                                </td>
                                                <td style="padding-left: 15px;">
                                                    <p style="margin: 0; color: #718096; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Fecha y Hora</p>
                                                    <p style="margin: 5px 0 0 0; color: #2d3748; font-size: 18px; font-weight: 700;">${startTime.toLocaleString('es-ES', { 
                                                        timeZone: 'Europe/Madrid',
                                                        weekday: 'long',
                                                        day: 'numeric',
                                                        month: 'long',
                                                        year: 'numeric'
                                                    })}</p>
                                                    <p style="margin: 3px 0 0 0; color: #4a5568; font-size: 16px; font-weight: 600;">${startTime.toLocaleString('es-ES', { 
                                                        timeZone: 'Europe/Madrid',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}</p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Duration -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 15px;">
                                            <tr>
                                                <td style="width: 40px; vertical-align: top;">
                                                    <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #12c2e9, #0093E9); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px;">⏱️</div>
                                                </td>
                                                <td style="padding-left: 15px;">
                                                    <p style="margin: 0; color: #718096; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Duración</p>
                                                    <p style="margin: 5px 0 0 0; color: #2d3748; font-size: 18px; font-weight: 700;">${service.duration} minutos</p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Price -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="width: 40px; vertical-align: top;">
                                                    <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #11998e, #38ef7d); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px;">💰</div>
                                                </td>
                                                <td style="padding-left: 15px;">
                                                    <p style="margin: 0; color: #718096; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Precio Total</p>
                                                    <p style="margin: 5px 0 0 0; color: #2d3748; font-size: 24px; font-weight: 800;">${finalPrice}€ ${discount ? `<span style="color: #11998e; font-size: 16px; font-weight: 600;">(-${discount}€ descuento)</span>` : ''}</p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Discount Badge -->
                            ${discount ? `
                            <div style="background: linear-gradient(135deg, #11998e, #38ef7d); border-radius: 12px; padding: 20px; margin-bottom: 30px; text-align: center;">
                                <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 700;">
                                    🎁 ¡Has usado tu descuento de cliente habitual!
                                </p>
                                <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.95); font-size: 14px;">
                                    Gracias por confiar en nosotros
                                </p>
                            </div>
                            ` : `
                            <div style="background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 12px; padding: 20px; margin-bottom: 30px; text-align: center;">
                                <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 700;">
                                    💡 Próxima cita con descuento
                                </p>
                                <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.95); font-size: 14px;">
                                    En tu próxima reserva obtendrás 2€ de descuento automático
                                </p>
                            </div>
                            `}
                            
                            <!-- Calendar Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                                <tr>
                                    <td align="center">
                                        <a href="${calendarEvent.data.htmlLink}" style="display: inline-block; background: linear-gradient(135deg, #ff6b9d, #c471ed); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 30px; font-size: 16px; font-weight: 700; box-shadow: 0 4px 15px rgba(255, 107, 157, 0.4);">
                                            📅 Añadir a Google Calendar
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Info Box -->
                            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                                <p style="margin: 0 0 10px 0; color: #92400e; font-size: 14px; font-weight: 600;">📌 Importante:</p>
                                <ul style="margin: 0; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.6;">
                                    <li style="margin-bottom: 8px;">Recibirás un recordatorio 24 horas antes de tu cita</li>
                                    <li style="margin-bottom: 8px;">Si necesitas cancelar o modificar, contáctanos con antelación</li>
                                    <li>Te esperamos 5 minutos antes de tu cita</li>
                                </ul>
                            </div>
                            
                            <!-- Contact -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="text-align: center; padding: 20px 0;">
                                        <p style="margin: 0 0 15px 0; color: #4a5568; font-size: 15px; font-weight: 600;">¿Necesitas ayuda?</p>
                                        <a href="tel:644137667" style="display: inline-block; color: #ff6b9d; text-decoration: none; font-size: 20px; font-weight: 700; margin: 0 15px;">
                                            📞 644 137 667
                                        </a>
                                        <a href="mailto:${process.env.EMAIL_USER}" style="display: inline-block; color: #ff6b9d; text-decoration: none; font-size: 16px; font-weight: 600; margin: 0 15px;">
                                            📧 Enviar email
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #2d3748; padding: 30px; text-align: center;">
                            <p style="margin: 0 0 15px 0; color: #a0aec0; font-size: 14px;">
                                Estás recibiendo este correo porque tienes una cita confirmada con nosotros
                            </p>
                            <p style="margin: 0; color: #718096; font-size: 12px;">
                                © ${new Date().getFullYear()} Salón de Belleza. Todos los derechos reservados.
                            </p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log('✅ Email enviado');
        } catch (error) {
            console.error('⚠️ Error enviando email:', error.message);
        }

        console.log('✅ Reserva completada');
        res.json({
            success: true,
            message: 'Cita creada exitosamente',
            calendarEventId: calendarEvent.data.id,
            calendarLink: calendarEvent.data.htmlLink
        });

    } catch (error) {
        console.error('❌ Error creando cita:', error);
        res.status(500).json({
            success: false,
            message: 'Error al procesar la reserva',
            error: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Peluquería - Sistema de Reservas con Auth'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`💇‍♀️ Sistema con autenticación activo`);
});