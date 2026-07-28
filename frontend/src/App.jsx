import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Calendar, Clock, User, Phone, Mail, Trash2, Edit3, ArrowLeft, 
  Send, Bot, Activity, CheckCircle2, ShieldAlert, X, AlertCircle
} from 'lucide-react';

const API_BASE = "https://amirtha-clinic-ai-agent.onrender.com/api";

export default function App() {
  const [page, setPage] = useState('home'); // 'home', 'booking', 'receptionist_login', 'dashboard'
  const [showBookingSuccess, setShowBookingSuccess] = useState(false);
  // Patient Booking Form State
  const [formData, setFormData] = useState({
    name: '', age: '', phone: '', email: '', date: '', time: ''
  });
  const [formError, setFormError] = useState('');
  const [appointments, setAppointments] = useState([]);
  const [editingId, setEditingId] = useState(null);

 // Time Alert State Variable
  const [activeAlertPatient, setActiveAlertPatient] = useState(null);
  const [lateAlertPatient, setLateAlertPatient] = useState(null);
  // Receptionist Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showWelcome, setShowWelcome] = useState(false);

  // Chatbot State
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hello Meena! I am your AI Receptionist Assistant. Ask me anything about appointments or no-show details.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [activeTable, setActiveTable] = useState(null); // 'todays' or 'total'

  // Fetch Appointments from Backend
  const fetchAppointments = async () => {
    try {
      const res = await axios.get(`${API_BASE}/appointments`);
      setAppointments(res.data);
    } catch (err) {
      console.error("Error fetching appointments:", err);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

   // Real-Time Appointment Window & 15-20 Min Late Checker
  useEffect(() => {
    const checkAppointmentTimeAlert = () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const currentMins = now.getHours() * 60 + now.getMinutes();

      let activePatient = null;
      let overduePatient = null;

      appointments.forEach(apt => {
        if (apt.date !== todayStr || !apt.time) return;
        if (apt.status === 'Attended' || apt.status === 'Cancelled' || apt.status === 'No Show') return;

        const [h, m] = apt.time.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return;
        const aptMins = h * 60 + m;

        // Active 10-min upcoming window
        if (currentMins >= aptMins && currentMins <= aptMins + 10) {
          activePatient = apt;
        }

        // 15-20 Mins LATE Overdue Window (Dr. Suresh Pain Point solved!)
        if (currentMins >= aptMins + 15 && currentMins <= aptMins + 30) {
          overduePatient = apt;
        }
      });

      setActiveAlertPatient(activePatient);
      setLateAlertPatient(overduePatient);
    };

    checkAppointmentTimeAlert();
    const interval = setInterval(checkAppointmentTimeAlert, 10000);
    return () => clearInterval(interval);
  }, [appointments]);

  // Format Email Automatically with @gmail.com
  const handleEmailChange = (val) => {
    let clean = val.trim();
    if (clean && !clean.includes('@')) {
      clean = clean + '@gmail.com';
    }
    setFormData({ ...formData, email: clean });
  };

  // Submit Patient Appointment Booking
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name || !formData.age || !formData.phone || !formData.email || !formData.date || !formData.time) {
      setFormError('Please fill in all required fields!');
      return;
    }

    try {
      if (editingId) {
        await axios.put(`${API_BASE}/appointments/${editingId}`, formData);
        setEditingId(null);
      } else {
        await axios.post(`${API_BASE}/appointments`, formData);
      }
      setFormData({ name: '', age: '', phone: '', email: '', date: '', time: '' });
      fetchAppointments();
      setShowBookingSuccess(true);
      setTimeout(() => setShowBookingSuccess(false), 3000);
    } catch (err) {
      setFormError('Failed to save appointment. Please check backend server.');
    }
  };

  // Delete Appointment
  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this appointment row?")) {
      try {
        await axios.delete(`${API_BASE}/appointments/${id}`);
        fetchAppointments();
      } catch (err) {
        alert("Failed to delete record.");
      }
    }
  };

  // Start Editing
  const handleEdit = (apt) => {
    setEditingId(apt.patient_id);
    setFormData({
      name: apt.name,
      age: apt.age,
      phone: apt.phone,
      email: apt.email,
      date: apt.date,
      time: apt.time
    });
  };

  // Receptionist Login Submit
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setLoginError('');

    if (!loginEmail || !loginPassword) {
      setLoginError('Email and Password are required!');
      return;
    }

    if (loginEmail === 'meena@email.com' && loginPassword === 'meena123') {
      setShowWelcome(true);
      setTimeout(() => {
        setShowWelcome(false);
        setPage('dashboard');
      }, 1500);
    } else {
      setLoginError('Invalid Email or Password!');
    }
  };

  // Update Status Dropdown (Increments no_show_count if 'No Show')
  const handleStatusChange = async (patient_id, newStatus) => {
    try {
      await axios.put(`${API_BASE}/appointments/${patient_id}/status`, { status: newStatus });
      fetchAppointments();
    } catch (err) {
      alert("Failed to update status.");
    }
  };

// Enquiry Button Click Handler
  const handleAlertEnquiry = (apt) => {
    setPage('dashboard');
    setActiveTable('todays');
    setMessages(prev => [
      ...prev,
      { 
        sender: 'ai', 
        text: `🚨 Active Appointment Alert for ${apt.name} (${apt.patient_id}) scheduled at ${apt.time}. Please update the status to "Attended" or "No Show" in the Today's Appointments table below.`,
        action: 'show_todays_appointments_button'
      }
    ]);
  };

  // AI Chat Send Message
  const handleSendChat = async () => {
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setChatInput('');

    try {
      const res = await axios.post(`${API_BASE}/chat`, { message: userMsg });
      const { reply, action } = res.data;

      setMessages(prev => [...prev, { sender: 'ai', text: reply, action }]);
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'ai', text: 'Sorry, I am unable to process your query right now.' }]);
    }
  };

  // Helper Counters
  const todayStr = new Date().toISOString().split('T')[0];
  const totalCount = appointments.length;
  const todayCount = appointments.filter(a => a.date === todayStr).length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">

      {/* 🚨 15-20 Min LATE Overdue Emergency Alert Banner */}
      {lateAlertPatient && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-red-600 text-white font-semibold px-6 py-3 rounded-2xl shadow-2xl border-2 border-red-400 flex items-center gap-4 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
            <span>🚨 LATE ALERT: <strong>{lateAlertPatient.name}</strong> ({lateAlertPatient.time}) is 15+ mins LATE!</span>
          </div>
          <button
            onClick={() => handleAlertEnquiry(lateAlertPatient)}
            className="bg-white hover:bg-slate-100 text-red-700 text-xs px-4 py-2 rounded-lg font-bold transition-all shadow"
          >
            Mark No-Show / Call
          </button>
        </div>
      )}

      {/* Appointment Booked Success Popup */}
      {showBookingSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-6 rounded-2xl shadow-2xl text-center border border-teal-100 max-w-sm w-full mx-4">
            <CheckCircle2 className="w-14 h-14 text-teal-600 mx-auto mb-3 animate-bounce" />
            <h2 className="text-xl font-bold text-slate-800">Appointment Booked Successfully!</h2>
            <p className="text-slate-500 text-sm mt-1">Patient details stored in CSV and doctor assigned.</p>
          </div>
        </div>
      )}

      {/* Welcome Meena Popup */}
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-8 rounded-2xl shadow-2xl text-center border border-teal-100 max-w-sm w-full mx-4">
            <CheckCircle2 className="w-16 h-16 text-teal-600 mx-auto mb-3 animate-bounce" />
            <h2 className="text-2xl font-bold text-slate-800">Welcome Meena!</h2>
            <p className="text-slate-500 text-sm mt-1">Logged into Receptionist Dashboard</p>
          </div>
        </div>
      )}

      {/* PAGE 1: HOME PAGE */}
      {page === 'home' && (
        <div className="relative h-screen w-full overflow-hidden flex flex-col justify-between">
          {/* Background Image with Calm Medical Overlay */}
          <div 
            className="absolute inset-0 bg-cover bg-center" 
            style={{ backgroundImage: `url('https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&q=80&w=2000')` }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-slate-900/70 via-teal-900/50 to-slate-900/80" />
          </div>

          {/* Center Heading */}
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4">
            <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-wide drop-shadow-md">
              Amirtha Clinic Hospital
            </h1>
            <p className="text-teal-200 mt-3 text-lg max-w-lg font-light">
              Compassionate Care, Advanced Medical Excellence & Smart Healthcare Management
            </p>
          </div>

          {/* Two Buttons Positioned ~25% From Bottom */}
          <div className="relative z-10 mb-[25vh] flex flex-col sm:flex-row items-center justify-center gap-6 px-6">
            <button
              onClick={() => setPage('booking')}
              className="w-64 py-4 px-6 bg-teal-600 hover:bg-teal-500 text-white font-semibold text-lg rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
            >
              <Calendar className="w-5 h-5" />
              Patient Appointment
            </button>
            <button
              onClick={() => setPage('receptionist_login')}
              className="w-64 py-4 px-6 bg-white hover:bg-slate-100 text-teal-800 font-semibold text-lg rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 border border-teal-100"
            >
              <User className="w-5 h-5" />
              Receptionist
            </button>
          </div>
        </div>
      )}

      {/* PAGE 2: PATIENT APPOINTMENT BOOKING FORM */}
      {page === 'booking' && (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            {/* Top Navigation */}
            <button 
              onClick={() => setPage('home')}
              className="mb-6 flex items-center gap-2 text-teal-700 font-medium hover:text-teal-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" /> Back to Home
            </button>

            {/* Main Form Box */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8 mb-10">
              <h2 className="text-2xl font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6 flex items-center gap-3">
                <Calendar className="w-7 h-7 text-teal-600" />
                Patient Appointment Booking
              </h2>

              {formError && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-lg flex items-center gap-3 animate-shake">
                  <ShieldAlert className="w-6 h-6 text-red-500 flex-shrink-0" />
                  <span className="font-medium text-sm">{formError}</span>
                </div>
              )}

             <form onSubmit={handleBookingSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Patient Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter full name"
                    value={formData.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^[a-zA-Z\s]*$/.test(val)) setFormData({ ...formData, name: val });
                    }}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Age *</label>
                  <input
                    type="number"
                    required
                    placeholder="Enter age"
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="Enter phone number"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Gmail *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter email prefix (auto adds @gmail.com)"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    onBlur={(e) => handleEmailChange(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Appointment Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Appointment Time *</label>
                  <input
                    type="time"
                    required
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                {/* 🔘 Single Submit Button & View Details Button Side-By-Side */}
                <div className="md:col-span-2 pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <button
                    type="submit"
                    className="w-full sm:w-auto flex-1 py-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-lg rounded-xl shadow-md transition-all"
                  >
                    {editingId ? "Update Appointment" : "Submit & Book Appointment"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage('view_appointments')}
                    className="w-full sm:w-auto py-4 px-6 bg-slate-100 hover:bg-slate-200 text-teal-800 font-semibold text-base rounded-xl transition-all border border-slate-200 flex items-center justify-center gap-2"
                  >
                    <Calendar className="w-5 h-5 text-teal-600" />
                    View Appointment Details
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* PAGE 2.5: DEDICATED VIEW APPOINTMENT DETAILS PAGE */}
      {page === 'view_appointments' && (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {/* Top Navigation */}
            <div className="flex items-center justify-between mb-6">
              <button 
                onClick={() => setPage('booking')}
                className="flex items-center gap-2 text-teal-700 font-medium hover:text-teal-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" /> Back to Booking Form
              </button>
              <button 
                onClick={() => setPage('home')}
                className="text-slate-500 hover:text-slate-800 text-sm font-medium"
              >
                Home
              </button>
            </div>

            {/* Full View Details Table */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8">
              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
                <span className="flex items-center gap-2">
                  <Calendar className="w-6 h-6 text-teal-600" /> All Patient Appointment Details
                </span>
                <span className="text-sm font-normal text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                  Total: {appointments.length} Records
                </span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 uppercase font-semibold text-xs border-b border-slate-200">
                      <th className="p-3">Patient ID</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Age</th>
                      <th className="p-3">Phone</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Date & Time</th>
                      <th className="p-3">Doctor</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Risk</th>
                      <th className="p-3">RSVP</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {appointments.length === 0 ? (
                      <tr>
                        <td colSpan="11" className="text-center py-8 text-slate-400">No appointments registered yet.</td>
                      </tr>
                    ) : (
                      appointments.map((apt) => (
                        <tr key={apt.patient_id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-semibold text-teal-700">{apt.patient_id}</td>
                          <td className="p-3 font-medium text-slate-800">{apt.name}</td>
                          <td className="p-3">{apt.age}</td>
                          <td className="p-3">{apt.phone}</td>
                          <td className="p-3 text-slate-500 text-xs">{apt.email}</td>
                          <td className="p-3 text-xs">{apt.date} at {apt.time}</td>
                          <td className="p-3">
                            <span className="inline-block px-2 py-1 bg-teal-50 text-teal-700 font-medium rounded text-xs">
                              {apt.doctor}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-800">
                              {apt.status || "Pending"}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                              apt.risk_score === 'High' ? 'bg-red-100 text-red-700 border border-red-200' :
                              apt.risk_score === 'Medium' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                              'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            }`}>
                              {apt.risk_score || 'Low'} Risk
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              apt.response === 'Yes' ? 'bg-emerald-100 text-emerald-800' :
                              apt.response === 'No' ? 'bg-red-100 text-red-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {apt.response === 'Yes' ? 'Yes 🟢' : apt.response === 'No' ? 'No 🔴' : 'Pending 🟡'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => {
                                  handleEdit(apt);
                                  setPage('booking'); // Redirect back to booking form page!
                                }}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors flex items-center gap-1 text-xs font-semibold"
                                title="Edit & Redirect to Form"
                              >
                                <Edit3 className="w-4 h-4" /> Edit
                              </button>
                              <button 
                                onClick={() => handleDelete(apt.patient_id)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete Row"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAGE 3: RECEPTIONIST LOGIN MODAL */}
      {page === 'receptionist_login' && (
        <div className="relative h-screen w-full flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <button 
            onClick={() => setPage('home')}
            className="absolute top-6 left-6 flex items-center gap-2 text-white/80 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Home
          </button>

          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full border border-slate-100">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center mx-auto mb-3">
                <User className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Receptionist Sign In</h2>
              <p className="text-slate-500 text-sm mt-1">Amirtha Clinic Hospital Management</p>
            </div>

            {loginError && (
              <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded text-sm flex items-center gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="meena@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-md transition-all mt-2"
              >
                Sign In
              </button>
            </form>
          </div>
        </div>
      )}

      {/* PAGE 4: RECEPTIONIST DASHBOARD (ChatGPT / Claude AI Style) */}
      {page === 'dashboard' && (
        <div className="h-screen flex flex-col bg-slate-900 text-slate-100">
          
          {/* Top Bar with Counters & User Title */}
          <header className="h-16 border-b border-slate-800 bg-slate-950 px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setPage('home')} 
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="font-bold text-lg text-teal-400 flex items-center gap-2">
                <Bot className="w-5 h-5 text-teal-400" /> AI Receptionist Assistant
              </h1>
            </div>
        {/* Small Counter Boxes with Doctor Workload */}
          
         <div className="flex items-center gap-3">
           <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-xs hidden sm:flex items-center gap-2">
             <span className="text-slate-400">Dr.Suresh:</span>
             <span className="font-bold text-teal-400">{appointments.filter(a => a.doctor === 'Dr.Suresh').length}</span>
             <span className="text-slate-400 ml-2">Dr.Anand:</span>
             <span className="font-bold text-teal-400">{appointments.filter(a => a.doctor === 'Dr.Anand').length}</span>
           </div>
           <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-2">
             <span className="text-xs text-slate-400">Total:</span>
             <span className="font-bold text-teal-400">{totalCount}</span>
           </div>
           <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-2">
             <span className="text-xs text-slate-400">Today:</span>
             <span className="font-bold text-amber-400">{todayCount}</span>
           </div>
         </div>
          </header>

          {/* Main Chat & Data Body */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 max-w-4xl w-full mx-auto">
            
            {/* Chat Messages */}
            {messages.map((m, idx) => (
              <div key={idx} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-xl p-4 rounded-2xl text-sm leading-relaxed ${
                  m.sender === 'user' 
                    ? 'bg-teal-600 text-white rounded-br-none' 
                    : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none shadow-sm'
                }`}>
                  {m.text}
                </div>

                {/* DYNAMIC ACTION BUTTONS RENDERED BY AI */}
                {m.action === 'show_todays_appointments_button' && (
                  <button
                    onClick={() => setActiveTable('todays')}
                    className="mt-3 py-2 px-4 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded-lg text-sm shadow-md transition-all flex items-center gap-2"
                  >
                    <Calendar className="w-4 h-4" /> Today's Appointments
                  </button>
                )}

                {m.action === 'show_total_appointments_button' && (
                  <button
                    onClick={() => setActiveTable('total')}
                    className="mt-3 py-2 px-4 bg-teal-500 hover:bg-teal-600 text-slate-900 font-bold rounded-lg text-sm shadow-md transition-all flex items-center gap-2"
                  >
                    <Activity className="w-4 h-4" /> Total Appointments
                  </button>
                )}
              </div>
            ))}

            {/* DYNAMIC TABLE SHOWING ON AI BUTTON CLICK */}
            {activeTable && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mt-6 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
                  <h3 className="font-bold text-teal-400 text-base">
                    {activeTable === 'todays' ? "Today's Appointments Table" : "Total Appointments Table"}
                  </h3>
                  <button 
                    onClick={() => setActiveTable(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 uppercase">
                      <tr>
                        <th className="p-2.5">Patient ID</th>
                        <th className="p-2.5">Patient Name</th>
                        <th className="p-2.5">Doctor Name</th>
                        <th className="p-2.5">Appointment Time</th>
                        <th className="p-2.5">Current Status</th>
                        <th className="p-2.5">No Shows</th>
                         <th className="p-2.5">Risk Level</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {(activeTable === 'todays' 
                        ? appointments.filter(a => a.date === todayStr)
                        : appointments
                      ).map((apt) => (
                        <tr key={apt.patient_id} className="hover:bg-slate-750">
                          <td className="p-2.5 font-bold text-teal-400">{apt.patient_id}</td>
                          <td className="p-2.5 font-medium text-slate-100">{apt.name}</td>
                          <td className="p-2.5 text-amber-300">{apt.doctor}</td>
                          <td className="p-2.5">{apt.time}</td>
                          <td className="p-2.5">
                            <select
                              value={apt.status || "Pending"}
                              onChange={(e) => handleStatusChange(apt.patient_id, e.target.value)}
                              className="bg-slate-900 border border-slate-600 text-slate-200 rounded px-2 py-1 focus:outline-none focus:border-teal-500"
                            >
                              <option value="Pending">Pending</option>
                              <option value="Attended">Attended</option>
                              <option value="No Show">No Show</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          </td>
                          <td className="p-2.5 font-bold text-red-400">{apt.no_show_count || 0}</td>
                          <td className="p-2.5 font-bold">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                              apt.risk_score === 'High' ? 'bg-red-900/80 text-red-300 border border-red-600' :
                              apt.risk_score === 'Medium' ? 'bg-amber-900/80 text-amber-300 border border-amber-600' :
                              'bg-emerald-900/80 text-emerald-300 border border-emerald-600'
                            }`}>
                              {apt.risk_score || 'Low'} Risk
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>

          {/* ChatGPT / Claude Style Input Area */}
          <div className="p-4 border-t border-slate-800 bg-slate-950">
            <div className="max-w-4xl mx-auto flex items-center gap-3">
              <input
                type="text"
                placeholder="Ask AI Receptionist (e.g., 'Today's appointments', 'Total appointments', 'Who has highest no show count?')..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3.5 focus:outline-none focus:border-teal-500"
              />
              <button
                onClick={handleSendChat}
                className="bg-teal-600 hover:bg-teal-500 text-white p-3.5 rounded-xl shadow-md transition-all"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}