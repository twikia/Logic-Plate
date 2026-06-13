# Product Strategy & Differentiators (VISION.md)

This document outlines the core purpose, technical goals, and unique marketplace differentiators for the application. It establishes the benchmark criteria that the Planning Agent must enforce during all ideation phases.

## 1. Core Mission Statement
To provide a friction-free, hyper-customizable hospitality discovery platform that delivers instant decision-making alignment for groups and individuals, eliminating the multi-hour fatigue of finding a place to eat.

---

## 2. Key Product Differentiators (Vs. Google Maps)

| Feature Pillar | Google Maps Core Failure | Our Solution | Psychological / Business Impact |
| :--- | :--- | :--- | :--- |
| **Speed to Value** | Overwhelming UI; optimized for search exploration rather than instant local answers. | **Immediate Close Options:** Single-tap interface yielding hyper-local, budget-friendly choices instantly. | **Hick's Law:** Minimizes response time by reducing choices ($T = b \cdot \log_2(n + 1)$). Eliminates choice paralysis. |
| **Granular Filtering & Customization** | Generic tags (e.g., "Good for groups"). No granular ingredient, dietary, or sourcing filters. | **Customization Engine:** Deep, user-defined query criteria far exceeding traditional standard map systems. | **Friction Reduction:** Delivers higher user intent matching, driving higher conversion and return retention. |
| **Nutritional AI Integration** | Static data menus or user-uploaded photos with zero contextual insight. | **Gemini Inference Pipeline:** Automatically analyzes menus to provide instant macronutrient estimates (Protein focus) and processed food scoring. | **Cognitive Load Minimization:** Removes the need to manually audit text menus or cross-reference third-party calorie trackers. |
| **Spatial Ranking** | Pins are passive, uniform dots. Requires manual sorting through side panels to compare distance vs. rank. | **Spatialized Rank Maps:** Live interactive map screens where pins scale and change based on real-time ranking and distinct dish type icons. | **Dual-Coding Theory:** Merging visual spatial positioning with distinct category iconography enhances information processing speed. |

---

## 3. Feature Specifications & Core Architecture

### A. Frictionless No-App Social Voting (The Guest Loop)
To maximize user acquisition and prevent group drop-off, the social decision loop must operate with zero friction fields and near-zero latency.
*   **The Mechanics:** The host generates an instant workspace voting room via the app, compiling a unique, secure tokenized link (web sandbox) for guests.
*   **The Guest View:** Friends open the link via an ephemeral mobile web browser. They do **not** log in, fill out profile fields, or download an application. They are presented with a rapid selection interface to swipe, rank, or upvote options.
*   **The Real-Time Alignment Engine:** Built natively on **Supabase Realtime (WebSockets)** rather than traditional database polling. Every swipe, vote, or tap broadcasts lightweight JSON payloads instantly across the cluster. 
*   **Latency Target:** State synchronization must resolve across all connected devices within **150ms to 400ms**. Even on a standard 4G LTE mobile connection, the interface must feel instantaneous, coming to a definitive group decision in less than 60 seconds total.
*   **The Viral Acquisition Hook:** 
    > 💡 **Viral Loop Principle:** By interacting with a seamless, sub-second mobile web interface that settles group arguments instantly, high-intent guest users experience immediate utility, converting them into app-store downloads organically.

### B. Spatial Interface & Map Customization
*   **Food Category Icons:** Abandon generic location pins. The map must dynamically swap pin designs out for custom asset icons indicating the exact food profile (e.g., a stylized burger icon, a taco icon, or noodle art).
*   **Live Rank Adjustments:** When filters change, pins must instantly scale or change opacity to reflect their comparative ranking against nearby alternatives, rather than just showing a flat location matrix.

---

## 4. Verification Benchmarks for the Agent
Before any feature code prompt is outputted for Cursor, the Planning Agent must verify that the proposed implementation aligns with these product constraints:

*   **Friction Check:** Does this addition require a user to tap more than twice from initial launch to see options? If yes, it violates the *Speed to Value* pillar.
*   **Dependency Restriction:** Does the social voting pipeline assume an authenticated user account for guests? If yes, halt execution and rewrite to preserve the *No-App Guest Loop*.
*   **Icon Clarity Check:** Are map icons abstract, or do they convey immediate structural food logic? They must convey immediate visual shorthand to prevent spatial confusion.