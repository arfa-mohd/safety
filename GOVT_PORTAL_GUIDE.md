# Government Authority Portal - Complete Feature Guide

## 🔐 Login Credentials
- **Email:** `govt@authority.gov`
- **Password:** `govt123`

## 📋 Features Available

### 1. 📥 View All Citizen Reports
- Access dashboard showing all 14 pothole reports from citizens
- See reporter name, email, mobile number
- View pothole detection details (count, confidence, location)
- See detection images in gallery view

### 2. ✅ Confirm/Approve Reports
- Click "Approve" button on any report
- Optionally add confirmation notes
- System automatically records:
  - Officer Name (Government Authority)
  - Confirmation Date & Time
  - Your notes

### 3. 📥 Download PDF Reports
- Full pothole detection report with:
  - Reporter information
  - All detection images
  - Location details
  - Confidence scores
- Button: "📥 Download PDF"
- Downloaded file: `pothole_report_[ID].pdf` (~744 KB)

### 4. 🎖️ Generate Verification Certificates
- Available for confirmed reports only
- PNG certificate showing:
  - **Reporter Details:** Name, email, mobile, report date
  - **Detection Info:** Potholes found, confidence level, location, coordinates
  - **Government Verification:** Your name, confirmation date, status, notes
  - **Professional Format:** 1200x800 px, professional layout
- Button: "🎖️ Certificate"
- Downloaded file: `verification_certificate_[ID].png` (~33 KB)

### 5. 🛣️ Mark Roads as FIXED/PENDING
- Change report status to indicate road repair status
- Button: "Mark as FIXED" or "Mark as PENDING"
- Status reflected in reports list

### 6. 🗺️ Location Information
- Google Maps link for each report
- Coordinates (latitude/longitude) for pothole locations

## 🔄 Typical Workflow

1. **Review:** Open government portal and review citizen reports
2. **Verify:** Check pothole detection images and location
3. **Confirm:** Click "Approve" to officially verify the report
4. **Document:** Download PDF for records
5. **Certificate:** Generate verification certificate for citizen
6. **Track:** Mark road as FIXED or PENDING
7. **Share:** Citizen can download certificate as proof

## 🎯 Status Tracking

Reports can have these authorizations:
- **PENDING** ⊘ - Awaiting government verification
- **CONFIRMED** ✓ - Government has verified and approved
- **REJECTED** ✗ - Not approved (optional status)

## 💾 Downloads Available

| Document | Format | Size | Purpose |
|----------|--------|------|---------|
| PDF Report | PDF | ~744 KB | Full detection report with images |
| Verification Certificate | PNG | ~33 KB | Government approval proof |

## 🔒 Security

- All downloads require government authentication
- Session-based access control
- HTTPS encrypted connection
- Regular citizens cannot access government portal

## 📱 Device Access

- **Desktop:** https://127.0.0.1:5005/govt
- **Mobile:** https://[LOCAL-IP]:5005/govt

---

**Status:** ✅ All features operational and tested
**Last Updated:** April 30, 2026
