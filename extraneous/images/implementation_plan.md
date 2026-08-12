# Digital Rewards Card Implementation

This plan outlines the architecture and frontend requirements for adding a digital rewards card system to the website, based on the **Register-Only Activation** approach.

## Goal Description

Create a secure, register-only flow for a Digital Rewards Card system:
1. **QR Code Activation**: The store keeps a printed QR code at the register. The website does *not* have a public "Sign Up" button.
2. **Customer Registration**: The customer scans the QR code, which opens an activation page on their phone. They enter their name and phone number and hit submit.
3. **Card Initialization**: Upon submission, their phone displays their new Digital Rewards Card with a scannable UPC barcode.
4. **First Punch**: The cashier scans the new UPC right there, using the employee UI to initialize the account and award the first punch.

## Responsibilities

- **Frontend (My Role)**: I will build the HTML/CSS/JS for the activation page and the employee UI. I will use mock API endpoints so the interface works visually.
- **Backend (Other AI's Role)**: The other AI will set up Cloudflare D1 and provide the actual API endpoints to connect to the frontend later.

## Proposed Changes

### Frontend (Customer Facing)
#### [NEW] `activate.html` (or `rewards.html`)
- A standalone, mobile-optimized page that is *only* accessible if you know the URL (or scan the QR code).
- **State 1**: A clean form asking for **Name** and **Phone Number**. 
- **State 2**: The Digital Rewards Card view. It dynamically renders a scannable UPC barcode (using `JsBarcode`) and shows their current punch balance (which will initially be 0 until the cashier scans it).

### Frontend (Staff Facing)
#### [NEW] `staff-dashboard.html`
- A hidden page for counter staff.
- **Scanner Input**: A text field that automatically receives the input from the physical barcode scanner and submits via the `Enter` key snippet you provided.
- **Action Buttons**: Once a customer is scanned, it displays their profile and provides a button to "Add 1 Punch" or "Redeem Reward".

## Verification Plan

### Automated/Local Testing
- Use mock data to test the sign-up flow and ensure the digital card renders beautifully.

### Manual Verification
- Test `activate.html` on a mobile screen size.
- Simulate the scanner input in `staff-dashboard.html` to verify the JS logic triggers the submit properly.
