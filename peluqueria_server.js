const express = require('express');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const paypal = require('@paypal/checkout-server-sdk'); // Import PayPal SDK
require('dotenv').config();

const app = express();

// Middlewares y Configuración Inicial
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

const transporter = nodemailer.createTransport({
    console.log('Configurando Nodemailer...');
    console.log('EMAIL_USER:', process.env.EMAIL_USER);

    // Configuración mejorada con timeout
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        connectionTimeout: 10000, // 10 segundos
        greetingTimeout: 5000,
        socketTimeout: 15000,
        debug: true,
        logger: true
    });

    // Verificar conexión
    transporter.verify(function (error, success) {
        if (error) {
            console.error('❌ Error de conexión con Gmail:', error);
        } else {
            console.log('✅ Servidor de correo listo');
        }
    });

// ===== PAYPAL CONFIG & COMMISSION CALCULATION =====
const PAYPAL_RATE = 0.029; // 2.9% de comisión de PayPal
const PAYPAL_FIXED_FEE = 0.35; // 0.35 EUR de tarifa fija de PayPal

function calculateGrossPrice(netPrice) {
    // Fórmula: Gross = (Net + FixedFee) / (1 - Rate)
    // Asegura que el monto neto recibido (después de comisiones) sea exactamente 'netPrice'
    const gross = (netPrice + PAYPAL_FIXED_FEE) / (1 - PAYPAL_RATE);
    // Redondear a 2 decimales
    return parseFloat(gross.toFixed(2));
}

const environment = process.env.PAYPAL_MODE === 'live' ?
    new paypal.core.LiveEnvironment(process.env.PAYPAL_LIVE_CLIENT_ID, process.env.PAYPAL_LIVE_SECRET) :
    new paypal.core.SandboxEnvironment(process.env.PAYPAL_SANDBOX_CLIENT_ID, process.env.PAYPAL_SANDBOX_SECRET);
const paypalClient = new paypal.core.PayPalHttpClient(environment);


// ===== SERVICE CONFIG =====
const services = {
    corte: { name: 'Corte de Pelo', duration: 45, price: 25 },
    tinte: { name: 'Tinte', duration: 120, price: 60 },
    mechas: { name: 'Mechas', duration: 150, price: 80 },
    peinado: { name: 'Peinado', duration: 60, price: 35 },
    tratamiento: { name: 'Tratamiento Capilar', duration: 90, price: 45 },
    manicura: { name: 'Manicura', duration: 45, price: 20 }
};

// ===== HELPER FUNCTIONS (UNCHANGED) =====
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
        // Se busca el índice de la fila que contiene el userId
        const rowIndex = rows.findIndex(row => row[0] === userId);

        if (rowIndex !== -1) {
            // El contador está en G, y las filas de Sheets comienzan en 1 (cabecera) + rowIndex + 1
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `Usuarios!G${rowIndex + 2}`,
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
        // Se obtiene hasta la columna L (para Método y Estado de Pago)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Reservas!A:L',
        });

        const rows = response.data.values || [];
        // userId ahora se asume en la columna L (índice 11)
        const appointments = rows
            .filter(row => row[11] === userId)
            .map(row => ({
                id: row[0],
                service: row[4],
                date: row[6],
                time: row[7],
                duration: row[5],
                price: row[8], // Precio Bruto o Precio Neto (Depende de PayPal o Tienda)
                paymentMethod: row[9], // Columna J
                status: row[10] // Columna K
            }));

        return appointments;
    } catch (error) {
        console.error('Error obteniendo citas:', error);
        return [];
    }
}

// Reusable core booking function (Now accepts payment details)
async function processBooking({ userId, serviceKey, date, time, finalPrice, user, isRecurring, paymentMethod, paymentStatus }) {
    // 1. Validar
    const service = services[serviceKey];
    if (!service) {
        throw new Error('Servicio no válido');
    }

    const fullDate = `${date}T${time}:00`;
    const startTime = new Date(fullDate);
    const endTime = new Date(startTime.getTime() + service.duration * 60000);

    const appointmentId = crypto.randomBytes(16).toString('hex');
    const finalFinalPrice = parseFloat(finalPrice);
    const netPrice = (isRecurring ? service.price - 2 : service.price);

    // 2. Registrar en Google Sheets
    // Columnas A:L -> [id, nombre, email, phone, service, duration, date, time, price, paymentMethod, status, userId]
    const row = [
        appointmentId,
        user.name,
        user.email,
        user.phone,
        service.name,
        service.duration.toString(),
        date,
        time,
        finalFinalPrice.toFixed(2), // Precio que el cliente pagó o debe pagar (Bruto si es PayPal, Neto si es Tienda)
        paymentMethod, // Tienda o PayPal
        paymentStatus, // Pendiente o Completado
        userId
    ];

    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Reservas!A:L',
        valueInputOption: 'USER_ENTERED',
        resource: { values: [row] }
    });

    // 3. Crear evento en Google Calendar
    const event = {
        summary: `${service.name} con ${user.name}`,
        location: 'Salón de Belleza',
        description: `Servicio: ${service.name}\nCliente: ${user.name}\nTeléfono: ${user.phone}\nPrecio Neto: ${netPrice.toFixed(2)}€\nMétodo de Pago: ${paymentMethod}\nEstado: ${paymentStatus}`,
        start: {
            dateTime: startTime.toISOString(),
            timeZone: 'Europe/Madrid',
        },
        end: {
            dateTime: endTime.toISOString(),
            timeZone: 'Europe/Madrid',
        },
        attendees: [
            { 'email': CALENDAR_OWNER_EMAIL, 'responseStatus': 'accepted' },
            { 'email': user.email, 'responseStatus': 'tentative' }
        ],
        reminders: {
            useDefault: false,
            overrides: [
                { method: 'email', minutes: 24 * 60 },
                { method: 'popup', minutes: 10 },
            ],
        },
    };

    const calendarEvent = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        resource: event,
    });

    // 4. Actualizar contador de citas
    await updateUserAppointmentCount(userId, user.appointmentCount + 1);

    // 5. Enviar Email de Confirmación (Actualizado para mostrar Método y Estado de Pago)

    const mailOptions = {
        from: `"Salón de Belleza 💇‍♀️" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: `✅ Cita Confirmada: ${service.name} - ${date} a las ${time}`,
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
                    
                    <tr>
                        <td style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 50px 30px; text-align: center;">
                            <div style="font-size: 80px; margin-bottom: 20px;">🎉</div>
                            <h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 700;">¡Cita Confirmada!</h1>
                            <p style="color: rgba(255,255,255,0.95); margin: 15px 0 0 0; font-size: 18px;">Tu reserva ha sido registrada con éxito</p>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 40px 35px;">
                            
                            <h2 style="color: #2d3748; font-size: 24px; font-weight: 700; margin: 0 0 15px 0;">Hola, ${user.name}</h2>
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                                Aquí están los detalles de tu próxima cita con ${service.name}. ¡Estamos deseando verte!
                            </p>

                            <div style="background-color: #f7fafc; border-radius: 12px; padding: 25px; margin-bottom: 30px; border: 1px solid #edf2f7;">
                                <h3 style="color: #2d3748; font-size: 20px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">Resumen de la Reserva</h3>
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="color: #4a5568; font-size: 16px;">
                                    <tr>
                                        <td style="padding: 8px 0; width: 30%; font-weight: 600;">Servicio:</td>
                                        <td style="padding: 8px 0; width: 70%; text-align: right;">${service.name}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: 600;">Fecha:</td>
                                        <td style="padding: 8px 0; text-align: right;">${date}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: 600;">Hora:</td>
                                        <td style="padding: 8px 0; text-align: right;">${time}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: 600;">Duración:</td>
                                        <td style="padding: 8px 0; text-align: right;">${service.duration} minutos</td>
                                    </tr>
                                    ${isRecurring ? `
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: 600; color: #38a169;">Descuento:</td>
                                        <td style="padding: 8px 0; text-align: right; color: #38a169;">-2.00€</td>
                                    </tr>` : ''}
                                    <tr>
                                        <td style="padding: 12px 0 0 0; font-weight: 700; font-size: 18px; border-top: 1px solid #e2e8f0;">Precio Neto:</td>
                                        <td style="padding: 12px 0 0 0; font-weight: 700; font-size: 18px; text-align: right; border-top: 1px solid #e2e8f0;">${netPrice.toFixed(2)}€</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: 600; font-size: 16px;">Método de Pago:</td>
                                        <td style="padding: 8px 0; text-align: right; font-weight: 600; font-size: 16px;">${paymentMethod}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: 700; font-size: 18px; color: ${paymentStatus === 'Completado' ? '#38a169' : '#f59e0b'};">Estado del Pago:</td>
                                        <td style="padding: 8px 0; text-align: right; font-weight: 700; font-size: 18px; color: ${paymentStatus === 'Completado' ? '#38a169' : '#f59e0b'};">${paymentStatus}</td>
                                    </tr>
                                    ${paymentMethod === 'PayPal' ? `
                                    <tr>
                                        <td colspan="2" style="padding-top: 10px; font-size: 12px; color: #718096; text-align: center;">
                                            (El cargo de PayPal fue de **${finalFinalPrice.toFixed(2)}€** para garantizar la recepción de ${netPrice.toFixed(2)}€ netos.)
                                        </td>
                                    </tr>` : ''}
                                </table>
                            </div>

                            <p style="text-align: center; margin-bottom: 25px;">
                                <a href="${calendarEvent.data.htmlLink}" target="_blank" style="display: inline-block; padding: 12px 25px; background-color: #ff6b9d; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 15px rgba(255, 107, 157, 0.4);">
                                    ➕ Añadir a Google Calendar
                                </a>
                            </p>

                            <div style="background-color: #fff7ed; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                                <p style="margin: 0 0 12px 0; color: #92400e; font-size: 15px; font-weight: 700;">📌 Recordatorio Importante:</p>
                                <ul style="margin: 0; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.8;">
                                    ${paymentStatus === 'Pendiente' ? '<li>Por favor, recuerda que tu pago de **' + netPrice.toFixed(2) + '€** se realizará directamente **en la tienda** el día de tu cita.</li>' : ''}
                                    <li>La cancelación o modificación de citas debe hacerse con un mínimo de 24 horas de antelación.</li>
                                    <li>Llega 5 minutos antes para una mejor experiencia.</li>
                                </ul>
                            </div>
                            
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
                    
                    <tr>
                        <td style="background-color: #2d3748; padding: 30px; text-align: center;">
                            <div style="font-size: 40px; margin-bottom: 15px; color: #ffffff;">💇‍♀️</div>
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
        await transporter.sendMail(mailOptions);
        console.log('✅ Email enviado');
    } catch (error) {
        console.error('⚠️ Error enviando email:', error.message);
    }

    return {
        success: true,
        message: 'Cita creada exitosamente',
        calendarEventId: calendarEvent.data.id,
        calendarLink: calendarEvent.data.htmlLink
    };
}


// ===== AUTH ENDPOINTS (UNCHANGED LOGIC) =====
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

        // Enviar email de bienvenida (EMAIL REMAINS UNCHANGED)
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
                    
                    <tr>
                        <td style="background: linear-gradient(135deg, #ff6b9d 0%, #c471ed 100%); padding: 50px 30px; text-align: center;">
                            <div style="font-size: 80px; margin-bottom: 20px;">🎉</div>
                            <h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 700;">¡Bienvenid@!</h1>
                            <p style="color: rgba(255,255,255,0.95); margin: 15px 0 0 0; font-size: 18px;">Has creado tu cuenta exitosamente</p>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 40px 35px;">
                            
                            <h2 style="color: #2d3748; font-size: 24px; font-weight: 700; margin: 0 0 15px 0;">Hola, ${name} 👋</h2>
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                                Estamos encantados de tenerte con nosotros. Ahora puedes disfrutar de todos estos beneficios:
                            </p>
                            
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
                            
                            <div style="background-color: #fff7ed; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                                <p style="margin: 0 0 12px 0; color: #92400e; font-size: 15px; font-weight: 700;">🚀 Próximos pasos:</p>
                                <ol style="margin: 0; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.8;">
                                    <li style="margin-bottom: 8px;">Inicia sesión en tu cuenta</li>
                                    <li style="margin-bottom: 8px;">Explora nuestros servicios</li>
                                    <li>¡Reserva tu primera cita!</li>
                                </ol>
                            </div>
                            
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
                    
                    <tr>
                        <td style="background-color: #2d3748; padding: 30px; text-align: center;">
                            <div style="font-size: 40px; margin-bottom: 15px; color: #ffffff;">💇‍♀️</div>
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
        res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, appointmentCount: user.appointmentCount } });
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
        res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, appointmentCount: user.appointmentCount } });
    } catch (error) {
        res.json({ success: false, message: 'Error obteniendo usuario' });
    }
});

// ===== APPOINTMENTS ENDPOINTS (Updated for In-Store Payment) =====
app.post('/appointments', async (req, res) => {
    // Este endpoint se usa para la opción "Pagar en Tienda"
    const { userId, serviceKey, date, time, isRecurring } = req.body;

    const paymentMethod = 'Tienda';
    const paymentStatus = 'Pendiente'; // Marcado como pendiente

    if (!userId || !serviceKey || !date || !time) {
        return res.status(400).json({ success: false, message: 'Faltan campos requeridos para la reserva' });
    }

    try {
        const user = await getUserById(userId);
        const service = services[serviceKey];

        if (!user || !service) {
            return res.status(404).json({ success: false, message: 'Usuario o servicio no encontrado' });
        }

        let finalPrice = service.price;
        if (isRecurring) {
            finalPrice -= 2; // Aplicar descuento de 2€
        }

        const bookingResult = await processBooking({
            userId, serviceKey, date, time,
            finalPrice, user, isRecurring,
            paymentMethod, paymentStatus
        });

        console.log('✅ Reserva con pago en tienda registrada');
        res.json(bookingResult);

    } catch (error) {
        console.error('❌ Error creando cita (Pago en Tienda):', error);
        res.status(500).json({
            success: false,
            message: 'Error al procesar la reserva con pago en tienda',
            error: error.message
        });
    }
});

app.get('/appointments/:userId', async (req, res) => {
    try {
        const appointments = await getUserAppointments(req.params.userId);
        res.json({ success: true, appointments });
    } catch (error) {
        res.json({ success: false, message: 'Error obteniendo citas' });
    }
});

// ===== PAYPAL ENDPOINTS (NEW) =====

// 1. Endpoint para calcular la comisión y el precio final a pagar por PayPal
app.post('/api/paypal/calculate-gross-price', (req, res) => {
    const { netPrice } = req.body;
    if (typeof netPrice !== 'number' || netPrice <= 0) {
        return res.status(400).json({ success: false, message: 'Precio neto no válido' });
    }
    const grossPrice = calculateGrossPrice(netPrice);
    res.json({
        success: true,
        grossPrice: grossPrice.toFixed(2),
        commission: (grossPrice - netPrice).toFixed(2),
        netPrice: netPrice.toFixed(2)
    });
});

// 2. Endpoint para crear una orden de pago en PayPal
app.post('/api/paypal/create-order', async (req, res) => {
    const { grossPrice, serviceName } = req.body;

    if (!grossPrice || !serviceName) {
        return res.status(400).json({ success: false, message: 'Faltan precio o nombre del servicio' });
    }

    // Asegurarse de que el precio sea string con 2 decimales para PayPal
    const amountValue = parseFloat(grossPrice).toFixed(2);

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: "CAPTURE",
        purchase_units: [
            {
                description: `Reserva: ${serviceName}`,
                amount: {
                    currency_code: "EUR",
                    value: amountValue,
                    breakdown: {
                        item_total: { currency_code: "EUR", value: amountValue }
                    }
                }
            }
        ]
    });

    try {
        const order = await paypalClient.execute(request);
        res.json({
            success: true,
            orderID: order.result.id
        });
    } catch (error) {
        console.error('❌ Error creando orden de PayPal:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error al crear la orden de PayPal',
            error: error.message
        });
    }
});

// 3. Endpoint para capturar el pago y procesar la reserva final
app.post('/api/paypal/capture-order', async (req, res) => {
    const { orderID, userId, serviceKey, date, time, isRecurring, netPrice } = req.body;

    if (!orderID || !userId || !serviceKey || !date || !time) {
        return res.status(400).json({ success: false, message: 'Faltan datos esenciales para confirmar la reserva' });
    }

    try {
        // 1. Capturar el pago de PayPal
        const request = new paypal.orders.OrdersCaptureRequest(orderID);
        request.requestBody({});
        const capture = await paypalClient.execute(request);

        // Verificar que el pago fue exitoso y el estado es COMPLETED
        if (capture.result.status !== "COMPLETED") {
            return res.status(400).json({ success: false, message: 'El pago de PayPal no se ha completado. Estado: ' + capture.result.status });
        }

        // 2. Procesar la reserva en el sistema
        const user = await getUserById(userId);
        const service = services[serviceKey];

        if (!user || !service) {
            return res.status(404).json({ success: false, message: 'Usuario o servicio no encontrado' });
        }

        // Recalcular el precio bruto que realmente pagó el cliente (con comisión)
        const grossPricePaid = calculateGrossPrice(netPrice);

        // Llamar a la función de booking con el estado y método de pago final
        const bookingResult = await processBooking({
            userId, serviceKey, date, time,
            finalPrice: grossPricePaid, // Guardamos el precio bruto pagado por el cliente
            user, isRecurring,
            paymentMethod: 'PayPal',
            paymentStatus: 'Completado'
        });

        console.log('✅ Reserva con PayPal completada y pagada');
        res.json(bookingResult);

    } catch (error) {
        console.error('❌ Error capturando pago y creando cita (PayPal):', error);
        res.status(500).json({
            success: false,
            message: 'Error al procesar el pago y la reserva con PayPal',
            error: error.message
        });
    }
});


// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Peluquería - Sistema de Reservas con Auth y PayPal'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`💇‍♀️ Sistema con autenticación y pagos activo`);
});