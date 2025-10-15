import React from "react";
import { Link } from "react-router-dom";
import "./LandingPage.css";

//No logic here, just a static page. The HTML should be self explanatory
export default function LandingPage() {
    return (
        <div className="landing-container">
            <div className="landing-hero">
                <h1 className="landing-title">CSV Fraud Analyzer</h1>
                <p className="landing-subtitle">
                    Build 0.1
                </p>

                <div className="landing-buttons">
                    <Link to="/login" className="landing-btn-primary">
                        Get Started
                    </Link>
                    <Link to="/signup" className="landing-btn-primary">
                        Sign Up
                    </Link>
                </div>
            </div>

            <div className="landing-features">
                <div className="feature-card">
                    <h3>Instant Analysis</h3>
                    <p>Upload your data in a
                        CSV file and view flagged transactions
                        immediately.
                    </p>
                </div>
                <div className="feature-card">
                    <h3>Customizable Analysis</h3>
                    <p>Analysis parameters are designed to be customized
                        by users, allowing clients to tailor the experience to their needs.
                    </p>
                </div>
            </div>

            <footer className="landing-footer">
                <p>This is a CSE485 capstone project made by Felix Allison, Bryson
                    Fought, Diya Jim, Kofi Eshun, and Melissa Dobos
                </p>
            </footer>
        </div>
    );
}
