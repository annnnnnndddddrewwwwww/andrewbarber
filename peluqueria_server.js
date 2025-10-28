const express = require('express');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const paypal = require('@paypal/checkout-server-sdk');
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

// ===== NODEMAILER SETUP =====
console.log('Configurando Nodemailer...');
console.log('EMAIL_USER:', process.env.EMAIL_USER);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 10000,
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
const PAYPAL_RATE = 0.029;
const PAYPAL_FIXED_FEE = 0.35;

function calculateGrossPrice(netPrice) {
    const gross = (netPrice + PAYPAL_FIXED_FEE) / (1 - PAYPAL_RATE);
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
        const userRow = rows.slice(1).find(row => row[2] === email); // Skip header

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
        const userRow = rows.slice(1).find(row => row[0] === userId); // Skip header

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
            '0'
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
        const rowIndex = rows.slice(1).findIndex(row => row[0] === userId);

        if (rowIndex !== -1) {
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
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: 'Reservas!A:L',
        });

        const rows = response.data.values || [];
        const appointments = rows.slice(1)
            .filter(row => row[11] === userId)
            .map(row => ({
                id: row[0],
                service: row[4],
                date: row[6],
                time: row[7],
                duration: row[5],
                price: row[8],
                paymentMethod: row[9],
                status: row[10]
            }));

        return appointments;
    } catch (error) {
        console.error('Error obteniendo citas:', error);
        return [];
    }
}

async function processBooking({ userId, serviceKey, date, time, finalPrice, user, isRecurring, paymentMethod, paymentStatus }) {
    const service = services[serviceKey];
    if (!service) {
        throw new Error('Servicio no válido');
    }

    console.log(`📅 Procesando reserva: ${service.name} para ${user.name} el ${date} a las ${time}`);

    const fullDate = `${date}T${time}:00`;
    const startTime = new Date(fullDate);
    const endTime = new Date(startTime.getTime() + service.duration * 60000);

    const appointmentId = crypto.randomBytes(16).toString('hex');
    const finalFinalPrice = parseFloat(finalPrice);
    const netPrice = (isRecurring ? service.price - 2 : service.price);

    // Registrar en Google Sheets
    const row = [
        appointmentId,
        user.name,
        user.email,
        user.phone,
        service.name,
        service.duration.toString(),
        date,
        time,
        finalFinalPrice.toFixed(2),
        paymentMethod,
        paymentStatus,
        userId
    ];

    console.log('📝 Guardando en Sheets:', row);

    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Reservas!A:L',
        valueInputOption: 'USER_ENTERED',
        resource: { values: [row] }
    });

    console.log('✅ Guardado en Sheets exitoso');

    // Crear evento en Google Calendar
    console.log('📆 Creando evento en Calendar...');
    
    const event = {
        summary: `${service.name} - ${user.name}`,
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
            { email: CALENDAR_OWNER_EMAIL, responseStatus: 'accepted' },
            { email: user.email, responseStatus: 'tentative' }
        ],
        reminders: {
            useDefault: false,
            overrides: [
                { method: 'email', minutes: 24 * 60 },
                { method: 'popup', minutes: 10 },
            ],
        },
    };

    let calendarEvent;
    try {
        calendarEvent = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            resource: event,
            sendUpdates: 'all'
        });
        console.log('✅ Evento creado en Calendar:', calendarEvent.data.id);
    } catch (calError) {
        console.error('❌ Error creando evento en Calendar:', calError.message);
        throw new Error('No se pudo crear el evento en el calendario: ' + calError.message);
    }

    // Actualizar contador de citas
    await updateUserAppointmentCount(userId, user.appointmentCount + 1);

    // Enviar Email
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
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4; padding: 40px 0;">
        <tr>
            <td align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden;">
                    <tr>
                        <td style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 50px 30px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 36px;">¡Cita Confirmada!</h1>
                            <p style="color: rgba(255,255,255,0.95); margin: 15px 0 0 0; font-size: 18px;">Tu reserva ha sido registrada</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 35px;">
                            <h2 style="color: #2d3748; font-size: 24px; margin: 0 0 15px 0;">Hola, ${user.name}</h2>
                            <div style="background-color: #f7fafc; border-radius: 12px; padding: 25px; margin-bottom: 30px;">
                                <h3 style="color: #2d3748; font-size: 20px; margin: 0 0 20px 0;">Resumen de la Reserva</h3>
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: 600;">Servicio:</td>
                                        <td style="padding: 8px 0; text-align: right;">${service.name}</td>
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
                                        <td style="padding: 12px 0 0 0; font-weight: 700; font-size: 18px;">Precio:</td>
                                        <td style="padding: 12px 0 0 0; font-weight: 700; font-size: 18px; text-align: right;">${netPrice.toFixed(2)}€</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: 600;">Método de Pago:</td>
                                        <td style="padding: 8px 0; text-align: right;">${paymentMethod}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: 700;">Estado:</td>
                                        <td style="padding: 8px 0; text-align: right; font-weight: 700; color: ${paymentStatus === 'Completado' ? '#38a169' : '#f59e0b'};">${paymentStatus}</td>
                                    </tr>
                                </table>
                            </div>
                            <p style="text-align: center; margin-bottom: 25px;">
                                <a href="${calendarEvent.data.htmlLink}" target="_blank" style="display: inline-block; padding: 12px 25px; background-color: #ff6b9d; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700;">
                                    ➕ Añadir a Google Calendar
                                </a>
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
        console.log('✅ Email enviado a:', user.email);
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
app.post('/appointments', async (req, res) => {
    const { userId, serviceKey, date, time, isRecurring } = req.body;

    if (!userId || !serviceKey || !date || !time) {
        return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
    }

    try {
        const user = await getUserById(userId);
        const service = services[serviceKey];

        if (!user || !service) {
            return res.status(404).json({ success: false, message: 'Usuario o servicio no encontrado' });
        }

        let finalPrice = service.price;
        if (isRecurring) {
            finalPrice -= 2;
        }

        const bookingResult = await processBooking({
            userId, serviceKey, date, time,
            finalPrice, user, isRecurring,
            paymentMethod: 'Tienda',
            paymentStatus: 'Pendiente'
        });

        console.log('✅ Reserva con pago en tienda registrada');
        res.json(bookingResult);

    } catch (error) {
        console.error('❌ Error creando cita:', error);
        res.status(500).json({
            success: false,
            message: 'Error al procesar la reserva',
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

// ===== PAYPAL ENDPOINTS =====
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

app.post('/api/paypal/create-order', async (req, res) => {
    const { grossPrice, serviceName } = req.body;

    if (!grossPrice || !serviceName) {
        return res.status(400).json({ success: false, message: 'Faltan datos' });
    }

    const amountValue = parseFloat(grossPrice).toFixed(2);
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: "CAPTURE",
        purchase_units: [{
            description: `Reserva: ${serviceName}`,
            amount: {
                currency_code: "EUR",
                value: amountValue
            }
        }]
    });

    try {
        const order = await paypalClient.execute(request);
        res.json({ success: true, orderID: order.result.id });
    } catch (error) {
        console.error('❌ Error PayPal:', error.message);
        res.status(500).json({ success: false, message: 'Error PayPal', error: error.message });
    }
});

app.post('/api/paypal/capture-order', async (req, res) => {
    const { orderID, userId, serviceKey, date, time, isRecurring, netPrice } = req.body;

    if (!orderID || !userId || !serviceKey || !date || !time) {
        return res.status(400).json({ success: false, message: 'Faltan datos' });
    }

    try {
        const request = new paypal.orders.OrdersCaptureRequest(orderID);
        request.requestBody({});
        const capture = await paypalClient.execute(request);

        if (capture.result.status !== "COMPLETED") {
            return res.status(400).json({ success: false, message: 'Pago no completado' });
        }

        const user = await getUserById(userId);
        const service = services[serviceKey];

        if (!user || !service) {
            return res.status(404).json({ success: false, message: 'Usuario/servicio no encontrado' });
        }

        const grossPricePaid = calculateGrossPrice(netPrice);

        const bookingResult = await processBooking({
            userId, serviceKey, date, time,
            finalPrice: grossPricePaid,
            user, isRecurring,
            paymentMethod: 'PayPal',
            paymentStatus: 'Completado'
        });

        console.log('✅ Reserva PayPal completada');
        res.json(bookingResult);

    } catch (error) {
        console.error('❌ Error capturando pago:', error);
        res.status(500).json({ success: false, message: 'Error procesando pago', error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Peluquería - Sistema de Reservas'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`💇‍♀️ Sistema con autenticación y pagos activo`);
});