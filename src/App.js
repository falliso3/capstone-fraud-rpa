import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from "react-router-dom";
import "./App.css";
import FraudCsvAnalyzer from "./FraudCSVAnalyzer";
import LoginPage from "./LoginPage";
import HelpPage from "./HelpPage";
import LandingPage from "./LandingPage";
import SignupPage from "./SignupPage";
import AdminPage from "./AdminPage";
import logo from "./tempLogo.png";

function App() {
  //Currently the only state variable here. May change in the future
  const [user, setUser] = useState(null);

  const handleLogout = () => setUser(null);

  return (
    <Router>
      <div className="app-container">
        {/*NOTE: The navigation bar only appears when logged in*/}
        {user && (
  <nav className="app-nav">
    <div className="nav-left">
      <img src={logo} alt="App Logo" className="nav-logo" />

      <Link to="/" className="nav-link">
        Analyzer
      </Link>
      <Link to="/help" className="nav-link">
        Help
      </Link>
      <Link to="/admin" className="nav-link">
        Admin
      </Link>
    </div>

    <div className="nav-right">
      <span className="nav-user">{user.email}</span>
      <button onClick={handleLogout} className="nav-logout-btn">
        Logout
      </button>
    </div>
  </nav>
)}


        <div className="app-content">
          <Routes>
            {/*Routes for people not logged in*/}
            {!user && (
              <>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage onLogin={setUser} />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="*" element={<Navigate to="/" />} />
              </>
            )}

            {/*Routes for logged-in users*/}
            {user && (
              <>
                <Route path="/" element={<FraudCsvAnalyzer />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*" element={<Navigate to="/" />} />
              </>
            )}
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
