document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // State
    // ----------------------------------------------------
    let currentDate = new Date(); // Active selected date
    let calendarDate = new Date(); // Month currently being viewed in sidebar (could be different from currentDate)
    
    // Elements
    const monthYearDisplay = document.getElementById('month-year-display');
    const calendarDays = document.getElementById('calendar-days');
    const dateInput = document.getElementById('date-input');
    const dayCircles = document.querySelectorAll('.day-circle');
    
    // Formatter helpers
    const getFormattedDateString = (dateObj) => {
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };
    
    let currentDateKey = getFormattedDateString(currentDate);

    // ----------------------------------------------------
    // 1. Generate UI Elements (Brain Dump & Timebox)
    // ----------------------------------------------------
    const initUIElements = () => {
        // Generate Brain Dump List (19 items)
        const bdList = document.getElementById('brain-dump-list');
        for (let i = 0; i < 19; i++) {
            const item = document.createElement('div');
            item.className = 'bd-item box-highlight';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'bd-checkbox';
            checkbox.dataset.key = `bd-check-${i}`;
            
            const input = document.createElement('textarea');
            input.className = 'bd-input auto-expand';
            input.placeholder = i === 0 ? 'Write down tasks, notes...' : '';
            input.dataset.key = `bd-text-${i}`;
            input.rows = 1;
            
            item.appendChild(checkbox);
            item.appendChild(input);
            bdList.appendChild(item);
        }

        // Generate Timebox Grid (5 to 24, plus 1 and 2, 30-min intervals)
        const gridBody = document.getElementById('timebox-grid');
        
        // Helper function to create a row for a specific hour
        const createHourRow = (h) => {
            const row = document.createElement('div');
            row.className = 'grid-row';
            
            const hourLabel = document.createElement('div');
            hourLabel.className = 'hour-label';
            hourLabel.textContent = h;
            row.appendChild(hourLabel);
            
            const minutesContainer = document.createElement('div');
            minutesContainer.className = 'minutes-container';
            
            // 2 intervals: :00 and :30
            const intervals = ['00', '30'];
            intervals.forEach(min => {
                const cell = document.createElement('div');
                cell.className = 'minute-cell box-highlight';
                
                const textarea = document.createElement('textarea');
                textarea.className = 'time-textarea';
                // Prefix 1 and 2 with 'next-' to avoid potential key collisions if we ever supported full 24h
                const keyPrefix = h <= 2 ? 'next-' : '';
                textarea.dataset.key = `time-${keyPrefix}${h}-${min}`;
                // Let placeholder indicate the time slot
                textarea.placeholder = `${h}:${min}`;
                
                cell.appendChild(textarea);
                minutesContainer.appendChild(cell);
            });
            
            row.appendChild(minutesContainer);
            gridBody.appendChild(row);
        };

        // Standard hours: 5 to 24
        for (let h = 5; h <= 24; h++) {
            createHourRow(h);
        }
        
        // Additional overtime hours: 1 and 2
        createHourRow(1);
        createHourRow(2);

        // Auto-expand textareas logic
        document.querySelectorAll('textarea.auto-expand').forEach(ta => {
            ta.addEventListener('input', function() {
                this.style.height = 'auto'; // Reset height
                this.style.height = (this.scrollHeight) + 'px'; // Set to actual scroll height
            });
        });
    };

    // ----------------------------------------------------
    // 2. Data Persistence (Save & Load logic with Firebase)
    // ----------------------------------------------------
    let unsubscribeSnapshot = null; // Store the unsubscribe function to clean up listeners

    const gatherSaveData = () => {
        const data = {};
        // Textareas (Priorities, BD Text, Timebox)
        document.querySelectorAll('textarea').forEach(el => {
            if (el.dataset.key) data[el.dataset.key] = el.value;
        });
        // Checkboxes (BD Check)
        document.querySelectorAll('.bd-checkbox').forEach(el => {
            if (el.dataset.key) data[el.dataset.key] = el.checked;
        });
        return data;
    };

    const saveDataForDate = async () => {
        if (!window.firebaseDB) return; // DB not ready yet
        const data = gatherSaveData();
        
        try {
            await window.setDoc(window.doc(window.firebaseDB, "planners", currentDateKey), data);
            // Optionally add a subtle indicator that saving was successful
        } catch (e) {
            console.error("Error saving document: ", e);
        }
    };

    const applyDataToUI = (data) => {
        // Restore all textareas
        document.querySelectorAll('textarea').forEach(el => {
            if (el.dataset.key) {
                el.value = data[el.dataset.key] || '';
                // Trigger auto-expand if it's an auto-expand textarea
                if(el.classList.contains('auto-expand')) {
                    el.style.height = 'auto';
                    el.style.height = (el.scrollHeight || 32) + 'px';
                }
            }
        });
        
        // Restore checkboxes
        document.querySelectorAll('.bd-checkbox').forEach(el => {
            if (el.dataset.key) {
                el.checked = !!data[el.dataset.key];
            }
        });
    }

    const loadDataForCurrentDate = () => {
        if (!window.firebaseDB) {
            // Wait for firebase to be ready if it's not yet
            window.addEventListener('firebaseReady', loadDataForCurrentDate, {once: true});
            return;
        }

        // Clean up previous listener if it exists
        if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
        }

        // Listen for real-time updates for the current date
        unsubscribeSnapshot = window.onSnapshot(
            window.doc(window.firebaseDB, "planners", currentDateKey), 
            (docSnapshot) => {
                if (docSnapshot.exists()) {
                    applyDataToUI(docSnapshot.data());
                } else {
                    // Document doesn't exist (new day), clear UI
                    applyDataToUI({});
                }
            },
            (error) => {
                console.error("Error listening to document: ", error); // Handle permissions or connectivity error
            }
        );
    };

    // Setup generic input listeners for saving
    const setupSaveListeners = () => {
        // Debounce function to prevent too many writes to Firestore
        let saveTimeout;
        const debouncedSave = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveDataForDate, 500); // Wait 500ms after last keystroke to save
        };

        document.querySelectorAll('textarea').forEach(el => {
            el.addEventListener('input', debouncedSave);
        });
        document.querySelectorAll('.bd-checkbox').forEach(el => {
            el.addEventListener('change', saveDataForDate); // Save immediately on checkbox toggle
        });
    };

    // ----------------------------------------------------
    // 3. Header Date & Day UI Updates
    // ----------------------------------------------------
    const updateHeaderDateUI = () => {
        // Format Date e.g., "YYYY. MM. DD."
        const yyyy = currentDate.getFullYear();
        const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
        const dd = String(currentDate.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}. ${mm}. ${dd}.`;

        // Update active Day of Week circle
        const dayOfWeek = currentDate.getDay(); // 0 is Sunday
        dayCircles.forEach(c => c.classList.remove('active'));
        const activeCircle = document.querySelector(`.day-circle[data-day="${dayOfWeek}"]`);
        if(activeCircle) activeCircle.classList.add('active');
    };

    // ----------------------------------------------------
    // 4. Sidebar Calendar Rendering
    // ----------------------------------------------------
    const renderCalendar = () => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        
        // Display Month Year
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        monthYearDisplay.textContent = `${monthNames[month]} ${year}`;
        
        // Calculate days
        const firstDayIndex = new Date(year, month, 1).getDay(); // Day of week of 1st day (0-6)
        const daysInMonth = new Date(year, month + 1, 0).getDate(); // Total days in this month
        const todayStr = getFormattedDateString(new Date()); // Actual today for highlighting today line
        
        calendarDays.innerHTML = ''; // clear calendar
        
        // Empty cells for days before the 1st
        for (let x = 0; x < firstDayIndex; x++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'cal-day empty';
            calendarDays.appendChild(emptyCell);
        }
        
        // Actual days
        for (let i = 1; i <= daysInMonth; i++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'cal-day';
            dayCell.textContent = i;
            
            const cellDate = new Date(year, month, i);
            const cellDateStr = getFormattedDateString(cellDate);
            
            if (cellDateStr === todayStr) {
                dayCell.classList.add('today');
            }
            if (cellDateStr === currentDateKey) {
                dayCell.classList.add('selected');
            }
            
            dayCell.addEventListener('click', () => {
                // Change current selected date
                currentDate = new Date(cellDate.getTime());
                currentDateKey = getFormattedDateString(currentDate);
                
                // Re-render and load
                renderCalendar(); 
                updateHeaderDateUI();
                loadDataForCurrentDate();
            });
            
            calendarDays.appendChild(dayCell);
        }
    };
    
    // Calendar controls
    document.getElementById('prev-month').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar();
    });
    
    document.getElementById('next-month').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar();
    });

    // ----------------------------------------------------
    // 5. App Initialization
    // ----------------------------------------------------
    const initApp = () => {
        initUIElements();
        setupSaveListeners();
        
        // Set UI to current selected date
        renderCalendar();
        updateHeaderDateUI();
        loadDataForCurrentDate();
    };

    initApp();
});
