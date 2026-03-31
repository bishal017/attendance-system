require("dotenv").config();
const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ===== MongoDB ===== */
mongoose.connect(
  process.env.MONGO_URI,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

/* ===== MODELS ===== */

// Attendance
const attendanceSchema = new mongoose.Schema({
  admNo: String,
  name: String,
  preference: String,
  date: String,
});

const Attendance = mongoose.model("Attendance", attendanceSchema);

// Student
const studentSchema = new mongoose.Schema({
  admNo: String,
  name: String,
  email: String,
  preference: String,
});

const Student = mongoose.model("Student", studentSchema);

/* ===== File Upload ===== */
const upload = multer({ dest: "uploads/" });

/* ===== Serve Pages ===== */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views/index.html"));
});

app.get("/scan", (req, res) => {
  res.sendFile(path.join(__dirname, "views/scan.html"));
});

/* ===================================================== */
/* ===== Upload Excel → Store Students ===== */
/* ===================================================== */

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    for (let row of data) {
      const admNo = row["Admission No"].toLowerCase();
      // const admNo = rawAdmNo.toString().toLowerCase();
      await Student.findOneAndUpdate(
        { admNo },
        {
          admNo,
          name: row["Name"],
          email: row["Email"],
          preference: row["Preferences"] || row["Preference"],
        },
        { upsert: true }
      );
    }

    res.send("Students Uploaded Successfully ✅");
  } catch (err) {
    console.error(err);
    res.status(500).send("Upload error");
  }
});
/* ===================================================== */
/* ===== Attendance Marking (WITH VALIDATION) ===== */
/* ===================================================== */

app.post("/attendance", async (req, res) => {
  try {
    const { admNo } = req.body;
    const today = new Date().toISOString().split("T")[0];

    const student = await Student.findOne({ admNo });

    if (!student) {
      return res.json({ message: "Invalid QR ❌" });
    }

    const exists = await Attendance.findOne({ admNo, date: today });

    if (exists) {
      return res.json({ message: `Already Marked ❌ (${student.name})` });
    }

    await Attendance.create({
      admNo,
      name: student.name,
      preference: student.preference,
      date: today,
    });

    res.json({
      message: `Marked ✅ (${student.name} - ${student.preference})`,
    });

  } catch (err) {
    res.status(500).send("Error");
  }
});

/* ===================================================== */
/* ===== Attendance Page (Table View) ===== */
/* ===================================================== */

app.get("/attendance", async (req, res) => {
  try {
    const data = await Attendance.find();

    let rows = "";

    for (let i = 0; i < data.length; i++) {
      rows += `
        <tr>
          <td>${i + 1}</td>
          <td>${data[i].admNo}</td>
          <td>${data[i].name}</td>
          <td>${data[i].preference}</td>
          <td>${data[i].date}</td>
        </tr>
      `;
    }

    res.send(`
      <html>
      <head>
        <title>Attendance</title>
        <style>
          body { font-family: Arial; text-align:center; }
          table { border-collapse: collapse; margin:auto; width:80%; }
          th, td { border:1px solid black; padding:10px; }
          th { background:#4CAF50; color:white; }
        </style>
      </head>
      <body>
        <h2>Attendance List</h2>
        <table>
          <tr>
            <th>#</th>
            <th>Admission No</th>
            <th>Name</th>
            <th>Preference</th>
            <th>Date</th>
          </tr>
          ${rows}
        </table>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Error loading attendance");
  }
});

/* ===================================================== */
/* ===== API: Attendance JSON ===== */
/* ===================================================== */

app.get("/attendance-list", async (req, res) => {
  const data = await Attendance.find();
  res.json(data);
});

/* ===================================================== */
/* ===== Delete Attendance ===== */
/* ===================================================== */

app.delete("/delete-attendance/:id", async (req, res) => {
  try {
    await Attendance.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted Successfully ✅" });
  } catch (err) {
    res.status(500).send("Error deleting");
  }
});

/* ===================================================== */
/* ===== Start Server ===== */
/* ===================================================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
