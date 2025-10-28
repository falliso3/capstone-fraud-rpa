import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./LoginPage.css";

export default function LoginPage({ onLogin }) {
  //Set state variables to empty by default since nothing's been entered
  //and no login has been attempted
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    //NOTE: Use for testing only
    const isTestUser = email === "test@test.com" && password === "test";
    const users = JSON.parse(localStorage.getItem("mockUsers") || "[]");
    const found = users.find((u) => u.email === email && u.password === password);

    //Verify email is valid
    if (found || isTestUser) {
      onLogin({ email });
    }
    //If not valid, throw error message on screen
    else {
      setError("Invalid email or password");
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2 className="login-title">Sign In</h2>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-button">Log In</button>
        </form>

        <div className="login-footer">
          <p>
            Don’t have an account?{" "}
            <Link to="/signup" className="signup-link">
              Sign Up
            </Link>
          </p>
          <Link to="/" className="back-link">
            Return to Landing Page
          </Link>
        </div>
      </div>
    </div>
  );
}
