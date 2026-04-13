-- Run this in MySQL Workbench after creating the database

CREATE DATABASE IF NOT EXISTS ada21tech_db;
USE ada21tech_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'student') DEFAULT 'student',
  grade INT,
  level VARCHAR(20),
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- For admin user, you'll need to insert after generating bcrypt hash
-- Example: INSERT INTO users (username, password, role, grade, status) VALUES ('admin', 'HASH_HERE', 'admin', NULL, 'approved');
