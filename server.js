require("dotenv").config();
const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ===== MongoDB ===== */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

/* ===== MODELS ===== */
const attendanceSchema = new mongoose.Schema({
  admNo: String,
  name: String,
  preference: String,
  date: String,
});
const Attendance = mongoose.model("Attendance", attendanceSchema);

const studentSchema = new mongoose.Schema({
  admNo: { type: String, unique: true },
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

/* ===== Upload Excel → Store Students ===== */
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded ❌");
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (!data.length) {
      return res.status(400).send("Excel file is empty ❌");
    }

    for (let row of data) {
      if (!row["Admission No"]) continue;

      const admNo = String(row["Admission No"]).trim().toLowerCase();

      await Student.findOneAndUpdate(
        { admNo },
        {
          admNo,
          name: row["Name"] || "",
          email: row["Email"] || "",
          preference: row["Preferences"] || row["Preference"] || "",
        },
        { upsert: true, new: true }
      );
    }

    res.send(`✅ ${data.length} students uploaded successfully!`);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).send("Error processing file ❌");
  } finally {
    // Clean up temp file
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
  }
});

/* ===== Attendance Marking ===== */
app.post("/attendance", async (req, res) => {
  try {
    const rawAdmNo = req.body?.admNo;

    if (!rawAdmNo || typeof rawAdmNo !== "string") {
      return res.status(400).json({ message: "Invalid input ❌" });
    }

    // Normalize: lowercase, trim, alphanumeric only
    const admNo = rawAdmNo.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

    if (!admNo) {
      return res.status(400).json({ message: "Invalid Admission No ❌" });
    }

    const today = new Date().toISOString().split("T")[0];

    const student = await Student.findOne({ admNo });
    if (!student) {
      return res.json({ message: "Invalid QR - Student not found ❌" });
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
    console.error("Attendance error:", err);
    res.status(500).json({ message: "Server error ❌" });
  }
});

/* ===== Attendance Table Page ===== */
app.get("/attendance", async (req, res) => {
  try {
    const data = await Attendance.find().sort({ date: -1 });

    const rows = data
      .map(
        (item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${item.admNo}</td>
          <td>${item.name}</td>
          <td>${item.preference}</td>
          <td>${item.date}</td>
        </tr>`
      )
      .join("");

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Attendance</title>
        <style>
          body { font-family: Arial; text-align:center; background:#f4f6f9; }
          table { border-collapse:collapse; margin:auto; width:80%; background:white; border-radius:8px; overflow:hidden; }
          th, td { border:1px solid #ddd; padding:12px; }
          th { background:#1abc9c; color:white; }
          tr:nth-child(even) { background:#f9f9f9; }
        </style>
      </head>
      <body>
        <h2>📋 Attendance List</h2>
        <table>
          <tr><th>#</th><th>Admission No</th><th>Name</th><th>Preference</th><th>Date</th></tr>
          ${rows || "<tr><td colspan='5'>No records found</td></tr>"}
        </table>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Error loading attendance ❌");
  }
});

/* ===== API: Attendance JSON ===== */
app.get("/attendance-list", async (req, res) => {
  try {
    const data = await Attendance.find().sort({ date: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Error fetching attendance" });
  }
});

/* ===== Delete Attendance ===== */
app.delete("/delete-attendance/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Basic ObjectId validation
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid ID ❌" });
    }

    const result = await Attendance.findByIdAndDelete(id);

    if (!result) {
      return res.status(404).json({ message: "Record not found ❌" });
    }

    res.json({ message: "Deleted Successfully ✅" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Error deleting ❌" });
  }
});

/* ===== 404 Handler ===== */
app.use((req, res) => {
  res.status(404).send("Page not found ❌");
});

/* ===== Start Server ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
