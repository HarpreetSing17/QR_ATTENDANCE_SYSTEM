require('dotenv').config();
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const pool = require('./db');
const path = require('path');


const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline';");
  next();
});

/* ==========================
   TEACHER ROUTES
========================== */

// ✅ Teacher Sign Up
app.post('/teacher/signup', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const [existing] = await pool.query('SELECT * FROM teachers WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.status(400).json({ message: 'Email already exists' });

    await pool.query('INSERT INTO teachers (name, email, password) VALUES (?, ?, ?)', [name, email, password]);
    res.status(201).json({ message: 'Teacher registered successfully' });
  } catch (err) {
    console.error('Teacher Signup Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Teacher Login
app.post('/teacher/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM teachers WHERE email = ? AND password = ?', [email, password]);
    if (rows.length > 0) {
      res.status(200).json({ message: 'Login successful', teacher: rows[0] });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('Teacher Login Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
 // ✅ Create QR Code for Lecture (with correct time)
 
 const moment = require("moment-timezone");

app.post('/teacher/create-lecture', async (req, res) => {
  const { teacher_id, subject, branch, semester, lecture_day, lecture_month } = req.body;

  if (!teacher_id || !subject || !branch || !semester || lecture_day === undefined || lecture_month === undefined) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // 📌 Get exact IST time
    const nowIST = moment().tz("Asia/Kolkata");
    const lectureTime = nowIST.format("HH:mm:ss");

    // 📌 Expiry Time = now + 1hr 15min
    const expiryIST = nowIST.clone().add(1, 'hour').add(15, 'minutes');
    const expiryTime = expiryIST.format("YYYY-MM-DD HH:mm:ss");

    // 📌 Lecture Date from day & month
    const year = nowIST.year();
    const lectureDate = `${year}-${String(parseInt(lecture_month) + 1).padStart(2, '0')}-${String(lecture_day).padStart(2, '0')}`;

    // 💾 Save to DB
    const [result] = await pool.query(
      `INSERT INTO lectures 
       (teacher_id, subject, lecture_date, lecture_time, expiry_time, branch, semester) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [teacher_id, subject, lectureDate, lectureTime, expiryTime, branch, semester]
    );

    const lectureId = result.insertId;
    const qrText = `lecture_id:${lectureId}`;
    const qrImage = await QRCode.toDataURL(qrText);

    await pool.query("UPDATE lectures SET qr_code = ? WHERE id = ?", [qrImage, lectureId]);

    console.log("✅ IST Time Saved:", lectureTime);
    console.log("✅ Expiry Time Saved:", expiryTime);

    res.status(201).json({ message: "QR Generated", qr: qrImage, lecture_id: lectureId });

  } catch (err) {
    console.error('Create Lecture Error:', err);
    res.status(500).json({ message: "Failed to create lecture" });
  }
});


// ✅ Get QR by Lecture ID
app.get('/teacher/lecture/:lectureId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT qr_code, expiry_time FROM lectures WHERE id = ?', [req.params.lectureId]);
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ message: 'Lecture not found' });
    }
  } catch (err) {
    console.error('Fetch QR Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ View Teacher's Attendance History
app.get('/teacher/history/:teacher_id', async (req, res) => {
  const { teacher_id } = req.params;
  try {
    const [lectures] = await pool.query('SELECT * FROM lectures WHERE teacher_id = ?', [teacher_id]);

    for (const lecture of lectures) {
      const [students] = await pool.query('SELECT * FROM attendance WHERE lecture_id = ?', [lecture.id]);
      lecture.attendance = students;
    }

    res.status(200).json({ history: lectures });
  } catch (err) {
    console.error('Fetch History Error:', err);
    res.status(500).json({ message: 'Failed to fetch attendance history' });
  }
});

// ✅ View Attendance for One Lecture
app.get('/teacher/lecture-attendance/:lecture_id', async (req, res) => {
  const { lecture_id } = req.params;
  try {
    const [attendance] = await pool.query(
      `SELECT 
        student_name, 
        roll_no, 
        branch, 
        ip_address, 
        scan_time,
        latitude,    
        longitude   
       FROM attendance 
       WHERE lecture_id = ?`,
      [lecture_id]
    );
    
    res.status(200).json({ 
      success: true,
      attendance 
    });
  } catch (err) {
    console.error('Fetch Lecture Attendance Error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch lecture attendance',
      error: err.message 
    });
  }
});

/* ==========================
   STUDENT ROUTES
========================== */

// ✅ Student Sign Up
app.post('/student/signup', async (req, res) => {
  const { name, email, rollno, password, branch, semester } = req.body;

  console.log("Signup Data:", { name, email, rollno, password, branch, semester }); // Debugging line

  try {
    const [existing] = await pool.query('SELECT * FROM students WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.status(400).json({ message: 'Email already registered' });

    await pool.query(
      'INSERT INTO students (name, email, roll_no, password, branch, semester) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, rollno, password, branch, semester]
    );

    res.status(201).json({ message: 'Student registered successfully' });
  } catch (err) {
    console.error('Student Signup Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// ✅ Student Login
app.post('/student/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM students WHERE email = ? AND password = ?', [email, password]);

    if (rows.length > 0) {
      res.status(200).json({ message: 'Login successful', student: rows[0] });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('Student Login Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// ✅ Mark Attendance with Geofencing
app.post('/student/mark-attendance', async (req, res) => {
  const { studentId, lectureId, latitude, longitude } = req.body;
  const scanTime = new Date();
  const studentIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection.remoteAddress;

  console.log("🟢 Incoming Attendance Request");
  console.log("Student ID:", studentId);
  console.log("Lecture ID:", lectureId);
  console.log("Scan Time:", scanTime);
  console.log("IP Address:", studentIP);
  console.log("Location:", latitude, longitude);

  // -----------------------
  // ✅ Geofencing Check
  // -----------------------
  const allowedLocations = [
    { lat: 32.810278, lng: 74.758528 },  // my home 

    {lat: 32.851083, lng:74.780056 },   //cse lab 

    {lat: 32.8519243, lng: 74.7792152 } //lecture hall
  ];
  const radiusInMeters = 30;

  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }

  let isInsideAllowedArea = false;
  for (const loc of allowedLocations) {
    const dist = getDistance(latitude, longitude, loc.lat, loc.lng);
    if (dist <= radiusInMeters) {
      isInsideAllowedArea = true;
      break;
    }
  }

  if (!isInsideAllowedArea) {
    console.log("🚫 Outside allowed location radius");
    return res.status(403).json({ success: false, message: 'You are not inside the allowed classroom area' });
  }

  try {
    // Check if lecture exists
    const [lectureRows] = await pool.query('SELECT * FROM lectures WHERE id = ?', [lectureId]);
    if (lectureRows.length === 0) {
      console.log("❌ Lecture not found");
      return res.status(404).json({ success: false, message: 'Lecture not found' });
    }

    // Check if QR is expired
    const expiry = new Date(lectureRows[0].expiry_time);
    if (scanTime > expiry) {
      console.log("⛔ QR code expired at:", expiry);
      return res.status(403).json({ success: false, message: 'QR code has expired' });
    }

    // Check if already marked
    const [existing] = await pool.query(
      'SELECT * FROM attendance WHERE lecture_id = ? AND student_id = ?',
      [lectureId, studentId]
    );
    if (existing.length > 0) {
      console.log("⚠ Attendance already marked");
      return res.json({ success: false, message: 'Attendance already marked' });
    }

    // Get student info
    const [studentRows] = await pool.query(
      'SELECT name, roll_no, email, branch FROM students WHERE id = ?',
      [studentId]
    );
    if (studentRows.length === 0) {
      console.log("❌ Student not found");
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const { name, roll_no, email, branch } = studentRows[0];

    // Insert attendance
    await pool.query(
      `INSERT INTO attendance (
        lecture_id, student_id, scan_time, ip_address,
        student_name, roll_no, email, branch, latitude, longitude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [lectureId, studentId, scanTime, studentIP, name, roll_no, email, branch, latitude, longitude]
    );

    console.log('✅ Attendance marked for ${name} (${roll_no}) at [${latitude}, ${longitude}]');

    res.json({
      success: true,
      message: 'Attendance marked successfully!',
      student: {
        name,
        roll_no,
        email,
        branch,
        scanTime,
        ip: studentIP,
        latitude,
        longitude
      }
    });
  }
  catch (err) {
    console.error("❌ Attendance Error:", err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

   

/* =============================
   ADMIN ROUTES
============================= */

// ✅ Get all Teachers
app.get('/admin/teachers', async (req, res) => {
  try {
    const [teachers] = await pool.query('SELECT id, name, email FROM teachers');
    res.json(teachers);
  } catch (err) {
    console.error('Fetch Teachers Error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// ✅ Get all Students
app.get('/admin/students', async (req, res) => {
  try {
    const [students] = await pool.query('SELECT id, name, roll_no, branch FROM students');
    res.json(students);
  } catch (err) {
    console.error('Fetch Students Error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// ✅ Get Teacher by ID (for edit page)
app.get('/admin/teacher/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [teacher] = await pool.query('SELECT id, name, email FROM teachers WHERE id = ?', [id]);
    if (teacher.length > 0) {
      res.json(teacher[0]);
    } else {
      res.status(404).json({ message: 'Teacher not found' });
    }
  } catch (err) {
    console.error('Fetch Teacher Error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// ✅ Get Student by ID (for edit page)
app.get('/admin/student/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [student] = await pool.query('SELECT id, name, email, roll_no, branch FROM students WHERE id = ?', [id]);
    if (student.length > 0) {
      res.json(student[0]);
    } else {
      res.status(404).json({ message: 'Student not found' });
    }
  } catch (err) {
    console.error('Fetch Student Error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// ✅ Update Teacher
app.put('/admin/update-teacher/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;

  try {
    await pool.query('UPDATE teachers SET name = ?, email = ? WHERE id = ?', [name, email, id]);
    res.json({ message: 'Teacher updated successfully' });
  } catch (err) {
    console.error('Update Teacher Error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// ✅ Update Student
app.put('/admin/update-student/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, roll_no, branch } = req.body;

  try {
    await pool.query(
      'UPDATE students SET name = ?, email = ?, roll_no = ?, branch = ? WHERE id = ?',
      [name, email, roll_no, branch, id]
    );
    res.json({ message: 'Student updated successfully' });
  } catch (err) {
    console.error('Update Student Error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// ✅ Delete Teacher
app.delete('/admin/delete-teacher/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM teachers WHERE id = ?', [id]);
    res.json({ message: 'Teacher deleted successfully' });
  } catch (err) {
    console.error('Delete Teacher Error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// ✅ Delete Student
app.delete('/admin/delete-student/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM students WHERE id = ?', [id]);
    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    console.error('Delete Student Error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// ✅ Export Data (Optional CSV export)
app.get('/admin/export-data', async (req, res) => {
  try {
    const [students] = await pool.query('SELECT * FROM students');
    const [teachers] = await pool.query('SELECT * FROM teachers');

    res.json({ students, teachers });
  } catch (err) {
    console.error('Export Data Error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});
// ✅ Get all lectures of a specific teacher
// Route: GET /admin/teacher-lectures/:id

app.get('/admin/teacher-lectures/:id', async (req, res) => {
  const teacherId = req.params.id;
  try {
    const [rows] = await db.query(`
      SELECT 
        l.id,
        l.subject,
        l.lecture_time,
        DATE(l.lecture_time) AS lecture_date,
        (
          SELECT COUNT(*) 
          FROM attendance a 
          WHERE a.lecture_id = l.id
        ) AS students_present
      FROM lectures l
      WHERE l.teacher_id = ?
      ORDER BY l.lecture_time DESC
    `, [teacherId]);

    res.json(rows);
  } catch (err) {
    console.error('Error fetching teacher lectures:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ✅ Get all attendance of a specific student
app.get('/admin/student-attendance/:studentId', async (req, res) => {
  const { studentId } = req.params;
  try {
    const [attendance] = await pool.query(
      `SELECT l.subject, l.lecture_time, 
              CASE WHEN a.id IS NOT NULL THEN 'Present' ELSE 'Absent' END AS status
       FROM lectures l
       LEFT JOIN attendance a ON l.id = a.lecture_id AND a.student_id = ?
       WHERE l.lecture_time <= NOW()`,
      [studentId]
    );
    res.json(attendance);
  } catch (err) {
    console.error('Fetch Student Attendance Error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});


// ✅ Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
