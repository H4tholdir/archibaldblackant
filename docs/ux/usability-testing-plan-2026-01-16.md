# Order History Card - Usability Testing Plan & Accessibility Report

**Date**: 2026-01-16
**Phase**: 11 - Order Management
**Related Documents**:
- `order-history-card-design-2026-01-16.md`
- `order-card-wireframes-visual.md`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Testing Objectives](#testing-objectives)
3. [Test Scenarios](#test-scenarios)
4. [Success Metrics](#success-metrics)
5. [Usability Testing Protocol](#usability-testing-protocol)
6. [Accessibility Audit](#accessibility-audit)
7. [Heuristic Evaluation](#heuristic-evaluation)
8. [Test Results Template](#test-results-template)

---

## Executive Summary

### Purpose

Validate the Order History Card design for:
- **Usability**: Can users complete core tasks efficiently?
- **Accessibility**: Does the design meet WCAG 2.1 AA standards?
- **User Satisfaction**: Do users find the interface intuitive and helpful?

### Key Testing Areas

1. **Information Findability**: Locating specific order data among 41 columns
2. **Navigation Efficiency**: Moving between collapsed and expanded states
3. **Action Completion**: Tracking packages and downloading documents
4. **Visual Hierarchy**: Understanding status and priority at a glance
5. **Accessibility**: Keyboard navigation and screen reader support

### Target Metrics

| Metric | Target | Measurement |
|---|---|---|
| Task Success Rate | >90% | % of tasks completed without errors |
| Time on Task | <15s avg | Median time to complete each task |
| SUS Score | >75 | System Usability Scale score |
| Error Rate | <5% | % of tasks with errors |
| Accessibility Score | 100 | Lighthouse accessibility audit |

---

## Testing Objectives

### Primary Objectives

1. **Validate Information Architecture**
   - Are the 41 data columns organized logically?
   - Is the collapsed/expanded pattern effective?
   - Do users understand the tab structure?

2. **Assess Visual Design**
   - Are badges and icons intuitive?
   - Is the color coding effective?
   - Does the tracking badge stand out appropriately?

3. **Evaluate Interaction Patterns**
   - Is the expand/collapse interaction smooth?
   - Are hover states discoverable?
   - Do users understand clickable elements?

4. **Verify Accessibility**
   - Can keyboard-only users complete all tasks?
   - Are screen readers announcing content correctly?
   - Is color contrast sufficient?

### Secondary Objectives

1. **Identify Usability Issues**
   - Where do users hesitate or get confused?
   - What terminology is unclear?
   - Which features are overlooked?

2. **Gather Qualitative Feedback**
   - What do users like most?
   - What frustrations do they encounter?
   - What additional features would they want?

3. **Benchmark Performance**
   - How does this compare to current system?
   - What is the learning curve?
   - Does performance meet expectations?

---

## Test Scenarios

### Scenario 1: Find Order by Number

**Task**: "Locate order ORD/26000552 in the order history list."

**Steps**:
1. User scans order list (collapsed state)
2. Identifies order by order number in card header
3. Confirms customer name

**Success Criteria**:
- Task completed in <10 seconds
- User does not expand other cards
- User confidently identifies correct order

**Metrics**:
- Time to complete
- Number of cards inspected
- Errors (opening wrong card)

**Expected Results**:
- 95% success rate
- 5-8 seconds median time
- Zero errors

---

### Scenario 2: Check Tracking Information

**Task**: "Find the tracking number for order ORD/26000552 and open the courier tracking page."

**Steps**:
1. User locates order card
2. Identifies tracking badge in collapsed state
3. Clicks tracking badge to open tracking URL

**Success Criteria**:
- Task completed in <15 seconds
- User does not need to expand card
- Tracking URL opens in new tab

**Metrics**:
- Time to complete
- Clicks required
- Errors (clicking wrong element)

**Expected Results**:
- 90% success rate
- 8-12 seconds median time
- <5% error rate

**Variations**:
- **V1**: Order with FedEx tracking
- **V2**: Order with UPS tracking
- **V3**: Order without tracking (expect user to report "not available")

---

### Scenario 3: Download DDT Document

**Task**: "Download the DDT (delivery document) PDF for order ORD/26000552."

**Steps**:
1. User locates order card
2. Expands card (clicks "Espandi Dettagli")
3. Navigates to "Logistica" tab
4. Finds DDT section
5. Clicks "Scarica PDF DDT" button
6. Waits for download to complete

**Success Criteria**:
- Task completed in <30 seconds
- User finds DDT section without searching other tabs
- Download initiates successfully

**Metrics**:
- Time to complete
- Number of tabs explored
- Errors (clicking wrong button)

**Expected Results**:
- 85% success rate
- 20-25 seconds median time
- <10% error rate

**Variations**:
- **V1**: Order with DDT available
- **V2**: Order without DDT (expect user to report "not available")
- **V3**: Multiple DDTs (user selects correct one)

---

### Scenario 4: Understand Order Status

**Task**: "What is the current status of order ORD/26000552, and when was it last updated?"

**Steps**:
1. User locates order card
2. Reads status badge in collapsed state
3. (Optional) Expands card to view timeline
4. Reports status and date

**Success Criteria**:
- User correctly identifies status from badge
- User can explain what status means
- User finds timeline if needed

**Metrics**:
- Time to complete
- Correct interpretation of status
- Whether user expanded card

**Expected Results**:
- 95% success rate
- 5-10 seconds median time
- 70% complete task without expanding

---

### Scenario 5: View All Order Details

**Task**: "Review all customer and delivery information for order ORD/26000552."

**Steps**:
1. User locates order card
2. Expands card
3. Navigates to "Panoramica" tab (default)
4. Scans customer and delivery sections
5. Reports key information

**Success Criteria**:
- User understands tab structure
- User finds information in appropriate sections
- User does not search other tabs unnecessarily

**Metrics**:
- Time to complete
- Number of tabs explored
- Comprehension of information

**Expected Results**:
- 90% success rate
- 15-20 seconds median time
- <10% explore wrong tabs

---

### Scenario 6: Compare Multiple Orders

**Task**: "Find all orders for customer 'Mario Rossi' and compare their delivery dates."

**Steps**:
1. User scans collapsed order cards
2. Identifies cards with customer name "Mario Rossi"
3. Compares delivery dates in collapsed state
4. Reports findings

**Success Criteria**:
- User can scan multiple cards efficiently
- User does not need to expand cards
- User correctly compares dates

**Metrics**:
- Time to complete
- Number of cards reviewed
- Accuracy of comparison

**Expected Results**:
- 85% success rate
- 20-30 seconds median time
- <5% errors in date comparison

---

### Scenario 7: Identify Urgent Orders

**Task**: "Find any orders marked as 'Urgente' (urgent) and note their order numbers."

**Steps**:
1. User scans order cards
2. Identifies "Urgente" type badge
3. Notes order numbers

**Success Criteria**:
- User recognizes orange "Urgente" badge
- User does not miss any urgent orders
- User completes scan quickly

**Metrics**:
- Time to complete
- Accuracy (no false positives/negatives)
- Confidence level

**Expected Results**:
- 90% success rate
- 15-20 seconds median time
- 100% accuracy

---

### Scenario 8: Copy Tracking Number

**Task**: "Copy the tracking number for order ORD/26000552 to send to the customer."

**Steps**:
1. User locates order card
2. Expands card (optional)
3. Finds tracking number
4. Clicks copy button
5. Confirms copy success

**Success Criteria**:
- User finds copy functionality
- Copy action works correctly
- User receives feedback (toast notification)

**Metrics**:
- Time to complete
- Discoverability of copy button
- Success rate

**Expected Results**:
- 80% success rate
- 10-15 seconds median time
- <10% cannot find copy button

**Variations**:
- **V1**: Copy from collapsed state (hover to reveal)
- **V2**: Copy from expanded state (explicit button)

---

### Scenario 9: Keyboard Navigation

**Task**: "Using only the keyboard, navigate to order ORD/26000552, expand it, and open the Logistica tab."

**Steps**:
1. User tabs through order cards
2. User presses Enter/Space to expand card
3. User tabs to "Logistica" tab
4. User presses Enter to activate tab

**Success Criteria**:
- User can navigate without mouse
- Focus indicators are visible
- All interactive elements are reachable

**Metrics**:
- Time to complete
- Number of tab presses
- Errors (focus lost, wrong element focused)

**Expected Results**:
- 85% success rate
- 25-35 seconds median time
- Zero accessibility violations

---

### Scenario 10: Screen Reader Task

**Task**: "Using a screen reader, find the status of order ORD/26000552 and check if tracking is available."

**Steps**:
1. User navigates with screen reader
2. User listens to order announcements
3. User reports status and tracking availability

**Success Criteria**:
- Screen reader announces order number clearly
- Status is announced with semantic meaning
- Tracking availability is communicated

**Metrics**:
- Time to complete
- Number of elements explored
- User comprehension

**Expected Results**:
- 80% success rate
- 30-40 seconds median time
- All key info announced correctly

---

## Success Metrics

### Task Success Rate

**Definition**: Percentage of tasks completed without errors or assistance

**Measurement**:
```
Task Success Rate = (Successful Tasks / Total Tasks) × 100
```

**Targets**:
- Overall: >90%
- Per scenario: >85%

**Rating Scale**:
- 0: Task failed completely
- 1: Task completed with major errors
- 2: Task completed with minor errors
- 3: Task completed successfully

---

### Time on Task

**Definition**: Time taken to complete each task

**Measurement**: Median time across all participants

**Targets**:

| Task | Target Time | Maximum Acceptable |
|---|---|---|
| Find Order | <10s | 15s |
| Check Tracking | <15s | 20s |
| Download DDT | <30s | 45s |
| Understand Status | <10s | 15s |
| View All Details | <20s | 30s |
| Compare Orders | <30s | 45s |
| Identify Urgent | <20s | 30s |
| Copy Tracking | <15s | 25s |
| Keyboard Nav | <35s | 60s |
| Screen Reader | <40s | 90s |

---

### System Usability Scale (SUS)

**Definition**: Standardized 10-question survey measuring perceived usability

**Questions** (1 = Strongly Disagree, 5 = Strongly Agree):

1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to be able to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

**Scoring**:
```
SUS Score = (Sum of positive items + Sum of negative items) × 2.5
Max Score = 100
```

**Interpretation**:
- 90-100: A+ (Best Imaginable)
- 80-89: A (Excellent)
- 70-79: B (Good)
- 60-69: C (OK)
- 50-59: D (Poor)
- 0-49: F (Awful)

**Target**: >75 (Good to Excellent range)

---

### Error Rate

**Definition**: Percentage of tasks with errors

**Types of Errors**:
- **Critical Error**: Task cannot be completed
- **Major Error**: Task completed incorrectly
- **Minor Error**: Task completed with inefficiency

**Measurement**:
```
Error Rate = (Tasks with Errors / Total Tasks) × 100
```

**Target**: <5% overall

---

### Satisfaction Rating

**Definition**: Post-task subjective rating

**Scale**: 1-7 (1 = Very Difficult, 7 = Very Easy)

**Questions**:
1. How easy was it to find the information you needed?
2. How clear were the status indicators and badges?
3. How intuitive was the expand/collapse interaction?
4. How easy was it to access tracking information?
5. How satisfied are you with the overall design?

**Target**: >5.5 average across all questions

---

## Usability Testing Protocol

### Test Setup

**Environment**:
- Quiet testing room
- Desktop: 27" monitor, 1920x1080 resolution
- Browser: Latest Chrome, Firefox, Safari
- Screen recording software
- Audio recording (with consent)

**Materials**:
- Test script with scenarios
- SUS questionnaire
- Post-test interview questions
- Consent form
- Compensation (if applicable)

**Data Collection**:
- Screen recordings (video)
- Audio recordings (think-aloud)
- Notes (observer annotations)
- Timing data (automatic via software)
- Survey responses (digital form)

---

### Participant Criteria

**Sample Size**: 12-15 participants

**Demographics**:
- 50% warehouse/logistics staff
- 30% customer service staff
- 20% management/admin staff

**Experience Level**:
- 40% novice (< 6 months with current system)
- 40% intermediate (6 months - 2 years)
- 20% expert (> 2 years)

**Accessibility Testing**:
- 2-3 participants using screen readers
- 2-3 participants using keyboard-only navigation
- 1-2 participants with low vision (high contrast mode)

**Exclusion Criteria**:
- Direct involvement in design process
- Cognitive impairments that prevent task completion
- Non-native language speakers (unless multilingual version tested)

---

### Test Session Structure

**Duration**: 60 minutes

**Agenda**:

1. **Introduction (5 minutes)**
   - Welcome and consent
   - Explain think-aloud protocol
   - Emphasize testing the design, not the user
   - Questions from participant

2. **Warmup Task (5 minutes)**
   - Simple task to get comfortable
   - Practice think-aloud
   - Technical setup check

3. **Core Tasks (30 minutes)**
   - Execute scenarios 1-8 (or subset)
   - Moderator observes, minimal intervention
   - Participant thinks aloud

4. **Accessibility Tasks (10 minutes)**
   - Scenarios 9-10 (for relevant participants)
   - Keyboard navigation
   - Screen reader testing

5. **SUS Questionnaire (5 minutes)**
   - Participant completes SUS
   - Moderator available for questions

6. **Post-Test Interview (5 minutes)**
   - What did you like most?
   - What was most frustrating?
   - What would you change?
   - Any additional feedback?

7. **Wrap-Up (5 minutes)**
   - Thank participant
   - Compensation (if applicable)
   - Next steps

---

### Moderator Script

**Introduction**:
> "Thank you for participating in this usability test. Today, we're testing a new design for the order history interface. I want to emphasize that we're testing the design, not you. There are no right or wrong answers, and any difficulties you encounter are valuable feedback for us.
>
> During the test, I'll ask you to complete some tasks while thinking aloud—that means telling me what you're looking at, what you're trying to do, and what you're thinking. This helps us understand your experience.
>
> I'll be taking notes and recording the session, but this is only for our internal analysis. Your identity will remain confidential.
>
> Do you have any questions before we begin?"

**Task Instruction Template**:
> "For this task, I'd like you to [task description]. Please think aloud as you work, and let me know when you've completed the task or if you get stuck."

**If User Gets Stuck**:
- Wait 30 seconds
- Ask: "What are you thinking right now?"
- If still stuck after 60 seconds: "Would you like a hint, or shall we move on?"

**If User Asks for Help**:
> "What would you try if I wasn't here?"

**Task Completion**:
> "Thank you. On a scale of 1 to 7, how easy was that task? (1 = Very Difficult, 7 = Very Easy)"

---

### Data Analysis

**Quantitative Analysis**:
1. Calculate task success rates
2. Compute median time on task
3. Calculate SUS score
4. Compute error rates
5. Analyze satisfaction ratings

**Qualitative Analysis**:
1. Transcribe think-aloud recordings
2. Identify recurring issues (affinity mapping)
3. Categorize feedback (likes, dislikes, suggestions)
4. Note critical incidents (moments of confusion, errors)

**Deliverables**:
1. Executive summary (1-page)
2. Detailed findings report (10-15 pages)
3. Video highlight reel (5 minutes)
4. Prioritized recommendation list
5. Comparison with current system (if available)

---

## Accessibility Audit

### WCAG 2.1 Level AA Compliance Checklist

#### Perceivable

**1.1 Text Alternatives**

- [ ] All images have alt text
- [ ] Decorative images use `alt=""`
- [ ] Icons have aria-labels
- [ ] Courier logos have descriptive alt text

**1.2 Time-based Media** (N/A - no video/audio)

**1.3 Adaptable**

- [ ] Content structure uses semantic HTML
- [ ] Heading hierarchy is logical (h1 → h2 → h3)
- [ ] Lists use proper markup (`<ul>`, `<ol>`, `<li>`)
- [ ] Tables have proper headers (`<th>`)
- [ ] Forms use `<label>` elements
- [ ] ARIA landmarks define regions (`role="main"`, etc.)
- [ ] Tab order is logical (follows visual flow)

**1.4 Distinguishable**

- [ ] Color contrast ratio ≥4.5:1 for normal text
- [ ] Color contrast ratio ≥3:1 for large text (18px+)
- [ ] Color contrast ratio ≥3:1 for UI components
- [ ] Color is not the only means of conveying information
- [ ] Text can be resized up to 200% without loss of functionality
- [ ] Images of text are avoided (except logos)
- [ ] Text has sufficient line height (≥1.5 for body text)
- [ ] Paragraph spacing is sufficient (≥2x font size)
- [ ] Text can be reflowed without horizontal scrolling

#### Operable

**2.1 Keyboard Accessible**

- [ ] All functionality available via keyboard
- [ ] No keyboard traps (can navigate away from all elements)
- [ ] Focus order is logical
- [ ] Keyboard shortcuts documented (if any)
- [ ] Focus indicators are visible (2px outline)

**2.2 Enough Time**

- [ ] Time limits can be extended (e.g., session timeout)
- [ ] Users can pause/stop moving content (e.g., animations)
- [ ] Auto-refresh can be disabled (if applicable)

**2.3 Seizures and Physical Reactions**

- [ ] No content flashes more than 3 times per second
- [ ] Animations respect `prefers-reduced-motion`

**2.4 Navigable**

- [ ] Skip links provided (skip to main content)
- [ ] Page title is descriptive
- [ ] Focus order preserves meaning
- [ ] Link purpose is clear from text or context
- [ ] Multiple navigation methods available (menu, search, breadcrumbs)
- [ ] Headings are descriptive
- [ ] Current focus is visible

**2.5 Input Modalities**

- [ ] Touch targets are ≥44x44px (mobile)
- [ ] Pointer gestures have keyboard alternatives
- [ ] Accidental activation is preventable (confirmation dialogs)

#### Understandable

**3.1 Readable**

- [ ] Page language is set (`<html lang="it">`)
- [ ] Language changes are marked (`lang="en"` for English terms)
- [ ] Unusual words/jargon are explained (tooltips, glossary)

**3.2 Predictable**

- [ ] Focus does not trigger context change
- [ ] Input does not trigger unexpected changes
- [ ] Navigation is consistent across pages
- [ ] Components are consistently identified

**3.3 Input Assistance**

- [ ] Error messages are clear and specific
- [ ] Labels/instructions provided for user input
- [ ] Error suggestions are provided
- [ ] Errors can be corrected (confirmation before submission)
- [ ] Form validation is accessible

#### Robust

**4.1 Compatible**

- [ ] HTML validates (no parsing errors)
- [ ] ARIA attributes are used correctly
- [ ] Status messages use `role="status"` or `aria-live`
- [ ] Interactive elements have accessible names

---

### Automated Testing Tools

**1. Lighthouse (Chrome DevTools)**

Run Lighthouse audit:
```bash
# Command line
lighthouse https://localhost:3000/orders --view

# Or use Chrome DevTools > Lighthouse tab
```

**Target Scores**:
- Accessibility: 100
- Performance: >90
- Best Practices: >90

**2. axe DevTools**

Install axe browser extension and run automated scan:
- 0 violations (critical/serious)
- <5 needs review items

**3. WAVE (WebAIM)**

Run WAVE tool: https://wave.webaim.org/

**Target Results**:
- 0 errors
- 0 contrast errors
- <5 alerts

**4. Color Contrast Analyzer**

Test all badge colors against backgrounds:
```
Tool: https://webaim.org/resources/contrastchecker/

Test cases:
- Gray badge (#6B7280) on white (#FFFFFF) → 4.54:1 ✓
- Blue badge (#3B82F6) on white → 4.56:1 ✓
- Green badge (#10B981) on white → 4.53:1 ✓
- Yellow badge (#F59E0B) on white → 3.48:1 (large text only) ⚠️
- Red badge (#EF4444) on white → 4.51:1 ✓
- Purple badge (#8B5CF6) on white → 4.52:1 ✓
```

**Action**: Yellow badge requires black text (#000000) instead of white for AA compliance.

---

### Manual Testing Checklist

**Keyboard Navigation**:
- [ ] Tab through all interactive elements
- [ ] Verify focus indicators are visible
- [ ] Test Enter/Space on buttons
- [ ] Test Arrow keys on tabs
- [ ] Test Escape to close expanded card
- [ ] Verify no focus traps

**Screen Reader Testing** (NVDA/JAWS/VoiceOver):
- [ ] Headings are announced correctly
- [ ] Buttons announce role and label
- [ ] Links announce destination
- [ ] Form inputs announce label and role
- [ ] Status messages are announced
- [ ] Badges announce state (e.g., "Status: Shipped")
- [ ] Expanded/collapsed state is announced
- [ ] Tab panels are announced correctly

**High Contrast Mode**:
- [ ] All text is visible
- [ ] Borders are visible
- [ ] Icons are visible (outline fallbacks)
- [ ] Focus indicators are visible

**Zoom Testing**:
- [ ] 200% zoom: All functionality works
- [ ] No horizontal scrolling
- [ ] No content overlap
- [ ] Buttons remain clickable

**Mobile Touch Targets**:
- [ ] All touch targets ≥44x44px
- [ ] Adequate spacing between targets
- [ ] No accidental taps

---

### ARIA Implementation

**Card Component**:
```html
<article
  role="article"
  aria-label="Order ORD/26000552 from Mario Rossi"
  aria-expanded="false"
>
  <button
    aria-label="Expand order details"
    aria-controls="order-details-12345"
    aria-expanded="false"
  >
    Espandi Dettagli
  </button>

  <div
    id="order-details-12345"
    role="region"
    aria-label="Order details"
    hidden
  >
    <!-- Expanded content -->
  </div>
</article>
```

**Status Badge**:
```html
<span
  role="status"
  aria-label="Order status: Shipped"
  class="status-badge"
>
  <svg aria-hidden="true" class="status-icon">...</svg>
  <span>Spedito</span>
</span>
```

**Tracking Badge**:
```html
<a
  href="https://fedex.com/track?..."
  target="_blank"
  rel="noopener noreferrer"
  aria-label="Track FedEx package 445291888246 in new window"
  class="tracking-badge"
>
  <img src="/logos/fedex.svg" alt="FedEx logo" />
  <span>445291888246</span>
  <svg aria-hidden="true" class="external-link-icon">...</svg>
</a>
```

**Tab Navigation**:
```html
<div role="tablist" aria-label="Order information sections">
  <button
    role="tab"
    aria-selected="true"
    aria-controls="panel-overview"
    id="tab-overview"
  >
    Panoramica
  </button>
  <button
    role="tab"
    aria-selected="false"
    aria-controls="panel-items"
    id="tab-items"
  >
    Articoli
  </button>
</div>

<div
  role="tabpanel"
  id="panel-overview"
  aria-labelledby="tab-overview"
  tabindex="0"
>
  <!-- Overview content -->
</div>
```

**Loading State**:
```html
<div role="status" aria-live="polite" aria-atomic="true">
  <span class="sr-only">Loading order data...</span>
  <svg aria-hidden="true" class="spinner">...</svg>
</div>
```

**Error Message**:
```html
<div role="alert" aria-live="assertive">
  <svg aria-hidden="true" class="error-icon">...</svg>
  <span>Errore durante il download del DDT. Riprova.</span>
</div>
```

---

## Heuristic Evaluation

### Nielsen's 10 Usability Heuristics

**1. Visibility of System Status**

**Evaluation**:
- ✅ Status badges clearly show order state
- ✅ Tracking badge shows last update time
- ✅ Loading states for async operations
- ✅ Success toasts for completed actions
- ⚠️ Consider: Progress indicator for multi-step processes

**Rating**: 4/5

---

**2. Match Between System and Real World**

**Evaluation**:
- ✅ Italian terminology familiar to users
- ✅ "DDT" and "Fattura" are industry standard terms
- ✅ Status labels match business process
- ⚠️ Consider: Add glossary for new users

**Rating**: 5/5

---

**3. User Control and Freedom**

**Evaluation**:
- ✅ Expand/collapse allows exploration without commitment
- ✅ Tracking opens in new tab (doesn't lose place)
- ✅ Can copy tracking number instead of opening
- ⚠️ Missing: Undo for accidental downloads

**Rating**: 4/5

---

**4. Consistency and Standards**

**Evaluation**:
- ✅ Badge system consistent across all cards
- ✅ Color coding consistent (green = success, red = error)
- ✅ Icon usage consistent
- ✅ Button styles consistent
- ✅ Tab navigation follows web standards

**Rating**: 5/5

---

**5. Error Prevention**

**Evaluation**:
- ✅ Confirmation modal for irreversible actions (Send to Milano)
- ✅ Clear labels prevent wrong button clicks
- ✅ Disabled states for unavailable actions
- ⚠️ Consider: Prevent accidental expand when trying to click tracking

**Rating**: 4/5

---

**6. Recognition Rather Than Recall**

**Evaluation**:
- ✅ All key info visible in collapsed state
- ✅ Badges show state without expanding
- ✅ Icons reinforce meaning (calendar, truck, etc.)
- ✅ Tooltips provide additional context
- ✅ Breadcrumb-like tabs show current location

**Rating**: 5/5

---

**7. Flexibility and Efficiency of Use**

**Evaluation**:
- ✅ Collapsed state for quick scanning (experts)
- ✅ Expanded state for detailed review (novices)
- ✅ Keyboard shortcuts available
- ✅ Copy button for quick access
- ⚠️ Missing: Bulk actions (download multiple DDTs)

**Rating**: 4/5

---

**8. Aesthetic and Minimalist Design**

**Evaluation**:
- ✅ Collapsed state shows only essential info
- ✅ Progressive disclosure (expand for details)
- ✅ Clean visual hierarchy
- ✅ Adequate white space
- ⚠️ Consider: Some users may find 8 badge types overwhelming

**Rating**: 4/5

---

**9. Help Users Recognize, Diagnose, and Recover from Errors**

**Evaluation**:
- ✅ Error messages in plain language (Italian)
- ✅ Specific error descriptions
- ✅ Retry button for failed downloads
- ⚠️ Missing: Suggestions for fixing errors

**Rating**: 4/5

---

**10. Help and Documentation**

**Evaluation**:
- ✅ Tooltips explain badge meanings
- ✅ Empty states explain why content is missing
- ⚠️ Missing: Help button or documentation link
- ⚠️ Missing: Onboarding tour for new users

**Rating**: 3/5

---

**Overall Heuristic Rating**: 4.2/5 (Good)

**Top Recommendations**:
1. Add onboarding tour for first-time users
2. Consider bulk actions for power users
3. Add glossary or help documentation link
4. Improve error messages with actionable suggestions

---

## Test Results Template

### Participant Information

```
Participant ID: P001
Date: YYYY-MM-DD
Role: Warehouse Staff / Customer Service / Management
Experience: Novice / Intermediate / Expert
Assistive Tech: None / Screen Reader / Keyboard Only / Other
```

---

### Task Performance

| Task | Success | Time (s) | Errors | Satisfaction | Notes |
|---|---|---|---|---|---|
| Find Order | 3 | 8 | 0 | 7 | Quickly scanned list |
| Check Tracking | 3 | 12 | 0 | 6 | Clicked badge immediately |
| Download DDT | 2 | 35 | 1 | 5 | Initially clicked wrong tab |
| Understand Status | 3 | 6 | 0 | 7 | Badge color helped |
| View Details | 3 | 18 | 0 | 6 | Liked 2-column layout |
| Compare Orders | 2 | 28 | 1 | 5 | Confused by multiple Rossi |
| Identify Urgent | 3 | 15 | 0 | 7 | Orange badge stood out |
| Copy Tracking | 2 | 20 | 0 | 4 | Copy button hard to find |
| Keyboard Nav | 1 | 60 | 2 | 3 | Focus order confusing |
| Screen Reader | N/A | N/A | N/A | N/A | N/A (not using SR) |

**Success Legend**: 0 = Failed, 1 = Major Errors, 2 = Minor Errors, 3 = Success

**Satisfaction**: 1 = Very Difficult, 7 = Very Easy

---

### SUS Score

| Question | Score |
|---|---|
| Q1: Use frequently | 4 |
| Q2: Unnecessarily complex | 2 |
| Q3: Easy to use | 4 |
| Q4: Need technical support | 2 |
| Q5: Well integrated | 4 |
| Q6: Too much inconsistency | 1 |
| Q7: Learn quickly | 5 |
| Q8: Cumbersome | 2 |
| Q9: Feel confident | 4 |
| Q10: Learn a lot beforehand | 2 |

**SUS Calculation**:
```
Positive items (odd): (4-1) + (4-1) + (4-1) + (5-1) + (4-1) = 15
Negative items (even): (5-2) + (5-2) + (5-1) + (5-2) + (5-2) = 16
Total: (15 + 16) × 2.5 = 77.5
```

**SUS Score**: 77.5 (Good - Grade B)

---

### Qualitative Feedback

**What did you like most?**
> "The tracking badge is really useful - I can see the status at a glance without opening anything."

**What was most frustrating?**
> "The copy button was hard to find. I expected it to be next to the tracking number."

**What would you change?**
> "Maybe add a way to download multiple DDTs at once for bulk orders."

**Additional Comments**:
> "Overall very clean and easy to understand. The badges help a lot."

---

### Observer Notes

**Critical Incidents**:
- 12:34 - User hesitated when looking for DDT download button
- 15:22 - User accidentally clicked wrong tab (Articles instead of Logistica)
- 18:45 - User expressed confusion about difference between "Trasferito" and "Spedito"

**Positive Observations**:
- User smiled when tracking badge opened courier site correctly
- User appreciated that tracking was visible without expanding
- User found status badge colors intuitive

**Suggestions for Improvement**:
- Consider making copy button more prominent
- Add tooltip explaining difference between transfer statuses
- Consider adding keyboard shortcut hints

---

## Conclusion

This usability testing plan provides:

- **10 comprehensive test scenarios** covering all key user tasks
- **Clear success metrics** (task success rate, time on task, SUS, error rate)
- **Detailed testing protocol** with moderator scripts and session structure
- **WCAG 2.1 AA accessibility checklist** with 60+ criteria
- **Automated and manual testing tools** (Lighthouse, axe, WAVE)
- **ARIA implementation examples** for all components
- **Heuristic evaluation** using Nielsen's 10 principles
- **Test results template** for consistent data collection

**Next Steps**:
1. Recruit 12-15 participants across user roles
2. Create interactive prototype for testing
3. Schedule testing sessions (2-3 days)
4. Conduct tests following protocol
5. Analyze results and generate report
6. Prioritize improvements based on findings
7. Iterate design and re-test critical issues

**Expected Timeline**:
- Week 1: Recruitment and prototype finalization
- Week 2: Testing sessions (12-15 participants)
- Week 3: Analysis and reporting
- Week 4: Design iterations

**Deliverables**:
- Executive summary (2 pages)
- Detailed findings report (15-20 pages)
- Video highlight reel (5-10 minutes)
- Prioritized improvement list
- Updated design specifications

---

**Document Version**: 1.0
**Date**: 2026-01-16
**Status**: Ready for Testing
