import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./SignupPage.css";

export default function SignupPage() {
    //State variables to be used later. Set to null values initially
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const navigate = useNavigate();

    //Handles signup events
    const handleSubmit = (e) => {
        e.preventDefault();

        if (password !== confirm) {
            setError("Passwords do not match");
            return;
        }

        //Mock signup: store user locally in localStorage
        const users = JSON.parse(localStorage.getItem("mockUsers") || "[]");
        const existing = users.find((u) => u.email === email);
        if (existing) {
            setError("Email already registered");
            return;
        }

        //Add a user locally
        users.push({ email, password });
        localStorage.setItem("mockUsers", JSON.stringify(users));

        setSuccess("Account created successfully! Redirecting to login...");
        setTimeout(() => navigate("/login"), 1500);
    };

    return (
        <div className="signup-container">
            <div className="signup-box">
                <h2 className="signup-title">Create Account</h2>

                <form onSubmit={handleSubmit}>
                    <div className="signup-field">
                        <label>Email</label>
                        <input
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="signup-field">
                        <label>Password</label>
                        <input
                            type="password"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <div className="signup-field">
                        <label>Confirm Password</label>
                        <input
                            type="password"
                            placeholder="Re-enter password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            required
                        />
                    </div>

                    {error && <div className="signup-error">{error}</div>}
                    {success && <div className="signup-success">{success}</div>}

                    <button type="submit" className="signup-button">
                        Sign Up
                    </button>
                </form>

                <div className="signup-footer">
                    <p>
                        Already have an account?{" "}
                        <Link to="/login" className="signup-link">
                            Log In
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
