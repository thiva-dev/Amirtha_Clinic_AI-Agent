import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse
from datetime import datetime, timedelta
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import pandas as pd
from contextlib import asynccontextmanager
import warnings

# Suppress deprecation warnings cleanly
warnings.filterwarnings("ignore")

try:
    import google.generativeai as genai
except ImportError:
    genai = None

from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler

load_dotenv()

CSV_FILE = "appointments.csv"

import requests

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")

def send_email(to_email: str, subject: str, html_body: str):
    if not RESEND_API_KEY:
        print(f"📧 [Email Simulated to {to_email}]: {subject}")
        return True
    
    try:
        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "from": "Amirtha Clinic Hospital <onboarding@resend.dev>",
            "to": [to_email],
            "subject": subject,
            "html": html_body
        }
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code in [200, 201]:
            print(f"📧 ✅ [Real Email Delivered via Resend API]: Successfully sent to {to_email}")
            return True
        else:
            print(f"❌ [Resend API Error]: {response.text}")
            return False
    except Exception as e:
        print(f"❌ [Email Exception Error]: {e}")
        return False
    
# 1. Automatic CSV Initialization
def init_csv():
    if not os.path.exists(CSV_FILE):
        df = pd.DataFrame(columns=[
            "patient_id", "name", "age", "phone", 
            "email", "date", "time", "doctor", 
            "status", "no_show_count", "response", "reminder_sent"
        ])
        df.to_csv(CSV_FILE, index=False)

def read_csv():
    init_csv()
    return pd.read_csv(CSV_FILE, dtype=str).fillna("")

# Doctor Workload Equal Split Logic
def assign_doctor():
    df = read_csv()
    if df.empty:
        return "Dr.Suresh"
    suresh_count = len(df[df["doctor"] == "Dr.Suresh"])
    anand_count = len(df[df["doctor"] == "Dr.Anand"])
    return "Dr.Suresh" if suresh_count <= anand_count else "Dr.Anand"

# 🕒 Automatic 1-Hour Prior Email Reminder Checker Job (Runs in Background)
def check_and_send_1hr_reminders():
    df = read_csv()
    if df.empty:
        return 0
    
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    current_mins = now.hour * 60 + now.minute
    
    if "reminder_sent" not in df.columns:
        df["reminder_sent"] = "No"
        df.to_csv(CSV_FILE, index=False)

    sent_count = 0
    for idx, row in df.iterrows():
        if str(row["date"]) != today_str:
            continue
        if str(row.get("status")) in ["Cancelled", "Attended"]:
            continue
        if str(row.get("reminder_sent")) == "Yes":
            continue
            
        time_str = str(row["time"])
        try:
            h, m = map(int, time_str.split(":"))
            apt_mins = h * 60 + m
            
            # Check if current time is within 60 mins before appointment time
            time_diff = apt_mins - current_mins
            if 0 <= time_diff <= 60:
                patient_email = row["email"]
                patient_name = row["name"]
                patient_id = row["patient_id"]
                doctor = row["doctor"]
                
                subject = f"🔔 1-Hour Prior Reminder: Your Appointment Today at Amirtha Clinic Hospital"
                html_body = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9fbfb;">
                    <h2 style="color: #0d9488; text-align: center;">Amirtha Clinic Hospital</h2>
                    <hr style="border: 0; border-top: 1px solid #0d9488;">
                    <p>Dear <strong>{patient_name}</strong>,</p>
                    <p>This is your <strong>1-Hour Prior Reminder</strong> for your scheduled appointment today at <strong>{time_str}</strong>.</p>
                    <div style="background-color: #ffffff; padding: 15px; border-left: 4px solid #0d9488; border-radius: 5px; margin: 15px 0;">
                        <p style="margin: 5px 0;"><strong>Patient ID:</strong> {patient_id}</p>
                        <p style="margin: 5px 0;"><strong>Doctor Assigned:</strong> {doctor}</p>
                        <p style="margin: 5px 0;"><strong>Date:</strong> {today_str}</p>
                        <p style="margin: 5px 0;"><strong>Time Slot:</strong> {time_str}</p>
                    </div>
                    
                    <!-- 🔘 Interactive RSVP Buttons -->
                    <div style="text-align: center; margin: 25px 0; padding: 15px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb;">
                        <p style="font-weight: bold; color: #374151; margin-bottom: 12px; font-size: 14px;">Are you attending this appointment in 1 hour?</p>
                        <a href="https://amirtha-clinic-ai-agent.onrender.com/api/confirm-appointment?id={patient_id}&response=Yes" style="background-color: #0d9488; color: white; padding: 10px 18px; text-decoration: none; font-weight: bold; border-radius: 6px; margin-right: 8px; display: inline-block; font-size: 13px;">✅ Yes, I'll Attend</a>
                        <a href="https://amirtha-clinic-ai-agent.onrender.com/api/confirm-appointment?id={patient_id}&response=No" style="background-color: #dc2626; color: white; padding: 10px 18px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block; font-size: 13px;">❌ No, Cancel Slot</a>
                    </div>

                    <p style="color: #6b7280; font-size: 12px; text-align: center;">Note: Must confirm 'Yes' at least 1 hour before slot time.</p>
                </div>
                """
                if send_email(patient_email, subject, html_body):
                    df.at[idx, "reminder_sent"] = "Yes"
                    sent_count += 1
        except Exception as e:
            print(f"Reminder Error: {e}")
            
    if sent_count > 0:
        df.to_csv(CSV_FILE, index=False)
        
    return sent_count

# Modern Lifespan Event Handler with 1-Min Interval Auto-Scheduler
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_csv()
    scheduler = BackgroundScheduler()
    # Checks every 1 minute for upcoming 1-hour prior appointments!
    scheduler.add_job(check_and_send_1hr_reminders, 'interval', minutes=1)
    scheduler.start()
    yield
    scheduler.shutdown()

app = FastAPI(title="Amirtha Clinic Hospital API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini AI (Optional Key from .env)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY and genai:
    genai.configure(api_key=GEMINI_API_KEY)

# Schemas
class AppointmentCreate(BaseModel):
    name: str
    age: int
    phone: str
    email: str
    date: str
    time: str

class AppointmentUpdate(BaseModel):
    name: str
    age: int
    phone: str
    email: str
    date: str
    time: str

class StatusUpdate(BaseModel):
    status: str

class ChatMessage(BaseModel):
    message: str

# ROOT ENDPOINT (Fixes 404 error)
@app.get("/")
def home():
    return {"message": "Amirtha Clinic Hospital Backend API is Running Successfully!"}

# API Endpoints
@app.get("/api/confirm-appointment", response_class=HTMLResponse)
def confirm_appointment(id: str, response: str):
    df = read_csv()
    if id not in df["patient_id"].values:
        return "<h2>Invalid Patient ID</h2>"
    
    idx = df[df["patient_id"] == id].index[0]
    patient_name = df.at[idx, "name"]
    apt_date_str = df.at[idx, "date"]
    apt_time_str = df.at[idx, "time"]
    
    clean_resp = "Yes" if response.lower() == "yes" else "No"
    
    # 🕒 1-Hour Cutoff Logic
    try:
        apt_dt = datetime.strptime(f"{apt_date_str} {apt_time_str}", "%Y-%m-%d %H:%M")
    except Exception:
        apt_dt = datetime.now()
        
    now = datetime.now()
    cutoff_dt = apt_dt - timedelta(hours=1)

    if clean_resp == "Yes":
        if now > cutoff_dt:
            return f"""
            <html>
                <head><title>Confirmation Window Closed</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
                <body style="font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f3f4f6; margin: 0;">
                    <div style="background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 420px; width: 90%;">
                        <h2 style="color: #dc2626; margin-bottom: 5px;">Amirtha Clinic Hospital</h2>
                        <h3 style="color: #374151; margin-top: 15px;">Confirmation Window Closed</h3>
                        <p style="color: #4b5563; line-height: 1.6; font-size: 15px;">
                            Dear <strong>{patient_name}</strong>, you can only confirm "Yes" at least <strong>1 hour before</strong> your appointment time ({apt_time_str}).
                        </p>
                        <p style="color: #d97706; font-weight: bold; font-size: 14px; background-color: #fef3c7; padding: 10px; border-radius: 8px;">Your status remains PENDING.</p>
                        <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #9ca3af;">
                            Please call clinic reception if you need assistance.
                        </div>
                    </div>
                </body>
            </html>
            """
        else:
            df.at[idx, "response"] = "Yes"
            df.to_csv(CSV_FILE, index=False)
            return f"""
            <html>
                <head><title>Appointment Confirmed</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
                <body style="font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f3f4f6; margin: 0;">
                    <div style="background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 420px; width: 90%;">
                        <h2 style="color: #0d9488; margin-bottom: 5px;">Amirtha Clinic Hospital</h2>
                        <h3 style="color: #374151; margin-top: 15px;">Hello, {patient_name}</h3>
                        <p style="color: #4b5563; line-height: 1.6; font-size: 15px;">Your attendance has been <strong>CONFIRMED</strong>! We look forward to seeing you at {apt_time_str}.</p>
                        <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #9ca3af;">You can close this window now.</div>
                    </div>
                </body>
            </html>
            """
    else:
        # "NO" Clicked -> Cancel & Increment No Show Count +1
        df.at[idx, "response"] = "No"
        df.at[idx, "status"] = "Cancelled"
        
        curr_no_show = int(df.at[idx, "no_show_count"]) if str(df.at[idx, "no_show_count"]).isdigit() else 0
        df.at[idx, "no_show_count"] = str(curr_no_show + 1)
        
        df.to_csv(CSV_FILE, index=False)
        return f"""
        <html>
            <head><title>Appointment Cancelled</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
            <body style="font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f3f4f6; margin: 0;">
                <div style="background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 420px; width: 90%;">
                    <h2 style="color: #dc2626; margin-bottom: 5px;">Amirtha Clinic Hospital</h2>
                    <h3 style="color: #374151; margin-top: 15px;">Hello, {patient_name}</h3>
                    <p style="color: #4b5563; line-height: 1.6; font-size: 15px;">Your appointment has been <strong>CANCELLED</strong> as requested and logged. Thank you for informing us.</p>
                    <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #9ca3af;">You can close this window now.</div>
                </div>
            </body>
        </html>
        """

@app.get("/api/appointments")
def get_appointments():
    df = read_csv()
    records = df.to_dict(orient="records")
    
    # Dynamic Risk Score Calculation
    for rec in records:
        no_show = int(rec.get("no_show_count", 0)) if str(rec.get("no_show_count", 0)).isdigit() else 0
        if no_show >= 2:
            rec["risk_score"] = "High"
        elif no_show == 1:
            rec["risk_score"] = "Medium"
        else:
            rec["risk_score"] = "Low"
            
    return records

@app.post("/api/appointments")
def create_appointment(data: AppointmentCreate, background_tasks: BackgroundTasks):
    df = read_csv()
    email = data.email.strip()
    if not email.endswith("@gmail.com"):
        email = (email.split("@")[0] if "@" in email else email) + "@gmail.com"
            
    patient_id = f"ACH-{1001 + len(df)}"
    assigned_doctor = assign_doctor()
    
    new_row = {
        "patient_id": patient_id,
        "name": data.name,
        "age": str(data.age),
        "phone": str(data.phone),
        "email": email,
        "date": data.date,
        "time": data.time,
        "doctor": assigned_doctor,
        "status": "Pending",
        "no_show_count": "0",
        "response": "Pending",
        "reminder_sent": "No"
    }
    
    df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    df.to_csv(CSV_FILE, index=False)
    
    # 📩 Instant Confirmation Receipt Email (Without RSVP Yes/No Buttons)
    subject = f"✅ Appointment Confirmed [{patient_id}] - Amirtha Clinic Hospital"
    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
        <div style="background-color: #0d9488; color: white; padding: 15px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 22px;">Amirtha Clinic Hospital</h1>
            <p style="margin: 5px 0 0 0; font-size: 14px;">Appointment Booking Receipt</p>
        </div>
        <div style="padding: 20px;">
            <p>Dear <strong>{data.name}</strong>,</p>
            <p>Your appointment has been successfully booked! Below are your confirmation details:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background-color: #f3f4f6;">
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Patient ID</td>
                    <td style="padding: 10px; border: 1px solid #ddd; color: #0d9488; font-weight: bold;">{patient_id}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Assigned Doctor</td>
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #d97706;">{assigned_doctor}</td>
                </tr>
                <tr style="background-color: #f3f4f6;">
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Appointment Date</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">{data.date}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Appointment Time</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">{data.time}</td>
                </tr>
            </table>

            <p style="color: #4b5563; font-size: 13px;">Note: You will receive a reminder email 1 hour prior to your appointment time with confirmation buttons.</p>
        </div>
        <div style="text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #eee; padding-top: 10px;">
            Thank you for choosing Amirtha Clinic Hospital.
        </div>
    </div>
    """
    
    background_tasks.add_task(send_email, email, subject, html_body)

    return {"message": "Appointment created successfully!", "data": new_row}

@app.put("/api/appointments/{patient_id}")
def update_appointment(patient_id: str, data: AppointmentUpdate):
    df = read_csv()
    if patient_id not in df["patient_id"].values:
        raise HTTPException(status_code=404, detail="Patient ID not found")
    
    idx = df[df["patient_id"] == patient_id].index[0]
    email = data.email.strip()
    if not email.endswith("@gmail.com"):
        email = (email.split("@")[0] if "@" in email else email) + "@gmail.com"

    df.at[idx, "name"] = data.name
    df.at[idx, "age"] = str(data.age)
    df.at[idx, "phone"] = str(data.phone)
    df.at[idx, "email"] = email
    df.at[idx, "date"] = data.date
    df.at[idx, "time"] = data.time
    
    df.to_csv(CSV_FILE, index=False)
    return {"message": "Appointment updated successfully!"}

@app.delete("/api/appointments/{patient_id}")
def delete_appointment(patient_id: str):
    df = read_csv()
    if patient_id not in df["patient_id"].values:
        raise HTTPException(status_code=404, detail="Patient ID not found")
    
    df = df[df["patient_id"] != patient_id]
    df.to_csv(CSV_FILE, index=False)
    return {"message": "Appointment deleted successfully!"}

@app.put("/api/appointments/{patient_id}/status")
def update_status(patient_id: str, data: StatusUpdate):
    df = read_csv()
    if patient_id not in df["patient_id"].values:
        raise HTTPException(status_code=404, detail="Patient ID not found")
    
    idx = df[df["patient_id"] == patient_id].index[0]
    new_status = data.status
    
    df.at[idx, "status"] = new_status
    if new_status == "No Show":
        current_count = int(df.at[idx, "no_show_count"]) if str(df.at[idx, "no_show_count"]).isdigit() else 0
        df.at[idx, "no_show_count"] = str(current_count + 1)
        
    df.to_csv(CSV_FILE, index=False)
    return {"message": f"Status updated to {new_status} successfully!"}

# AI Chatbot Endpoint (ChatGPT / Claude Style Dynamic Smart AI Engine)
@app.post("/api/chat")
def chat_with_ai(payload: ChatMessage):
    user_msg = payload.message.strip().lower()
    df = read_csv()
    
    # Live Dates Calculation for AI Context
    today_date = datetime.now()
    today_str = today_date.strftime("%Y-%m-%d")
    tomorrow_str = (today_date + timedelta(days=1)).strftime("%Y-%m-%d")
    
    # Trigger 1: Today's Appointments (Dynamic Table Button)
    if "today's appointment" in user_msg or "today appointment" in user_msg or user_msg == "today's appointments":
        return {
            "reply": "Today's appointments-ai paarka keezha irukkura 'Today's Appointments' button-ah click pannunga.",
            "action": "show_todays_appointments_button"
        }
        
    # Trigger 2: Total Appointments (Dynamic Table Button)
    if "total appointment" in user_msg or user_msg == "total appointments":
        return {
            "reply": "total appointments-ai paarka keezha irukkura 'total Appointments' button-ah click pannunga.",
            "action": "show_total_appointments_button"
        }

    # Trigger 3: Overbooking / Risk Recommendations
    if "risk" in user_msg or "overbook" in user_msg or "standby" in user_msg or "recommend" in user_msg:
        if df.empty:
            return {"reply": "No patient records available to evaluate risk.", "action": "none"}
        
        df['no_show_num'] = pd.to_numeric(df['no_show_count'], errors='coerce').fillna(0)
        high_risk = df[df['no_show_num'] >= 2]
        
        if high_risk.empty:
            return {"reply": "All current patients have a LOW/MEDIUM risk profile. No double-booking or standby needed today.", "action": "none"}
        
        high_names = ", ".join([f"{r['name']} ({r['time']})" for _, r in high_risk.iterrows()])
        return {
            "reply": f"⚠️ HIGH NO-SHOW RISK ALERT: Patient(s) with >= 2 no-shows: {high_names}. Recommendation: Meena should send an early nudge or keep a standby patient ready for these slots.",
            "action": "show_todays_appointments_button"
        }

    csv_data_str = df.to_string(index=False)
    
    # --- 🤖 1. GEMINI AI ENGINE (ChatGPT / Claude Intelligence) ---
    if GEMINI_API_KEY and genai:
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            prompt = (
                f"You are the AI Receptionist Assistant at Amirtha Clinic Hospital.\n"
                f"Today's Date: {today_str}\n"
                f"Tomorrow's Date: {tomorrow_str}\n\n"
                f"Current Hospital Appointments Database (CSV Snapshot):\n{csv_data_str}\n\n"
                f"User Question: {payload.message}\n\n"
                f"Instructions: Answer accurately using the CSV data. Be helpful, professional, and concise like ChatGPT/Claude. "
                f"If asked about tomorrow's appointments, check for date '{tomorrow_str}' and list patient names, doctor, and time slots."
            )
            response = model.generate_content(prompt)
            if response and response.text:
                return {"reply": response.text.strip(), "action": "none"}
        except Exception as e:
            print(f"Gemini API note: {e}")

    # --- 🧠 2. SMART DYNAMIC FALLBACK ENGINE (If No Gemini API Key) ---
    
    # Case A: Tomorrow's Appointments Query
    if "tomorrow" in user_msg:
        if df.empty:
            return {"reply": "There are no appointment records in the database.", "action": "none"}
        tomorrow_apts = df[df["date"] == tomorrow_str]
        if tomorrow_apts.empty:
            return {"reply": f"No appointments scheduled for tomorrow ({tomorrow_str}).", "action": "none"}
        
        apts_list = "\n".join([f"• {r['name']} (ID: {r['patient_id']}) at {r['time']} with {r['doctor']} [{r['status']}]" for _, r in tomorrow_apts.iterrows()])
        return {"reply": f"📅 Tomorrow's Appointments ({tomorrow_str}):\n\n{apts_list}", "action": "none"}

    # Case B: Highest No-Show Query
    if "highest no-show" in user_msg or "highest no show" in user_msg:
        if df.empty:
            return {"reply": "There are no patient records currently.", "action": "none"}
        df['no_show_num'] = pd.to_numeric(df['no_show_count'], errors='coerce').fillna(0)
        max_no_show = df['no_show_num'].max()
        if max_no_show == 0:
            return {"reply": "No patients have any no-shows registered yet.", "action": "none"}
        top_patients = df[df['no_show_num'] == max_no_show]
        names = ", ".join(top_patients['name'].tolist())
        return {"reply": f"The patient(s) with the highest no-show count ({int(max_no_show)}) is/are: {names}.", "action": "none"}

    # Case C: Doctor Specific Queries (Dr. Suresh / Dr. Anand)
    if "suresh" in user_msg or "anand" in user_msg:
        doc_name = "Dr.Suresh" if "suresh" in user_msg else "Dr.Anand"
        doc_apts = df[df["doctor"].str.lower() == doc_name.lower()]
        if doc_apts.empty:
            return {"reply": f"No appointments currently assigned to {doc_name}.", "action": "none"}
        apts_list = ", ".join([f"{r['name']} ({r['date']} at {r['time']})" for _, r in doc_apts.iterrows()])
        return {"reply": f"Appointments assigned to {doc_name} ({len(doc_apts)} total): {apts_list}.", "action": "none"}

    # Case D: More than X no-shows
    if "more than" in user_msg and "no-show" in user_msg:
        df['no_show_num'] = pd.to_numeric(df['no_show_count'], errors='coerce').fillna(0)
        filtered = df[df['no_show_num'] > 2]
        if filtered.empty:
            return {"reply": "No patients have more than 2 no-shows.", "action": "none"}
        names = ", ".join(filtered['name'].tolist())
        return {"reply": f"Patients with more than 2 no-shows: {names}.", "action": "none"}

    # Case E: Default Summary Reply
    return {
        "reply": f"I am your AI Receptionist Assistant. Total registered patients: {len(df)}. Today is {today_str}. You can ask me about today's/tomorrow's appointments, doctor schedules, or patient risk history!",
        "action": "none"
    }

@app.post("/api/send-reminders")
def trigger_reminders():
    count = check_and_send_1hr_reminders()
    return {"message": f"Reminders processed. Sent {count} reminders for upcoming 1-hour appointments."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)