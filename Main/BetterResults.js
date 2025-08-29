// BetterResults.js

"use strict";


// MARK: observers
// like in minecraft

//so aperently smartschool likes to remove buttons so this will add them back every time they do 
const wideToolbarObserver = new MutationObserver((mutations) => {
  for (const { type, removedNodes } of mutations) {
    if (type !== "childList" || removedNodes.length === 0) continue;

    removedNodes.forEach((node) => {
      if (node.id === "show-grid" || node.id === "show-graph") {
        $(".wide-toolbar").append(node);
      }
    });
  }
});

// so it look at the #smscMain cuzz that loads first of course and then look sat the child 
new MutationObserver((mutations, obs) => {
  for (const { type, addedNodes } of mutations) {
    // if we find the wide-toolbar we continue
    if (
      type === "childList" &&
      addedNodes.length === 1 &&
      addedNodes[0].classList.contains("wide-toolbar")
    ) {
      obs.disconnect(); // stop observing cuzz we found the toolbar

      console.log('[BetterResults] Toolbar detected, initializing extension...');

      // now tool barr is getting stalked (removed child stalking joke)
      wideToolbarObserver.observe($(".wide-toolbar")[0], {
        childList: true,
        subtree: false,
      });

      // we load all our shit
      createCustomContentArea();

       
       LoadGrid();
       LoadGraph();
       addButtons();
       addCourseIconStyles();

      // yea so if the url chnages we just say (we out a here) so this is important or else you break ur smartschool 🙃
      setupURLChangeDetection();

      console.log('[BetterResults] Extension initialized successfully');

      // letting granddad know that we made it (Send message to background script)
      try {
        chrome.runtime.sendMessage({
          action: 'extensionInitialized',
          timestamp: Date.now()
        });
      } catch (e) {
        console.log('[BetterResults] Could not send message to background script:', e.message);
      }
    }
  }
}).observe($("#smscMain")[0], { childList: true, subtree: false });


// MARK:Helper utilities

/** Format 3/5 -> "60.0%" with one decimal */
function ratioToPercent(num, den) {
  return `${Math.round((num / den) * 1000) / 10}%`;
}

/** Inject the Poppins Google font once */
function addGoogleFont() {
  if (!document.getElementById("poppins-font")) {
    $("<link>", {
      id: "poppins-font",
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap",
    }).appendTo("head");
  }
}

/** Load a CSS file if it hasn't been loaded yet */
function loadCSS(href, id) {
  console.log(`[BetterResults] Loading CSS file: ${href}, ID: ${id}`);

  if (!document.getElementById(id)) {
    console.log(`[BetterResults] Creating new link element for ${id}`);
    const linkElement = $("<link>", {
      id,
      rel: "stylesheet",
      href: chrome.runtime.getURL(href)
    }).appendTo("head");
    console.log(`[BetterResults] CSS file link created and appended for ${id}`, linkElement);
  } else {
    console.log(`[BetterResults] CSS file ${id} already exists, skipping load`);
  }
}

/** Load CSS styles for course icons */
function addCourseIconStyles() {
  loadCSS("static/css/better-results-course-icons.css", "better-results-course-icons-css");
}


// MARK: Button injection
// for tha Wide‑toolbar 


// Global variables for tab management
let currentCustomTab = null; // 'grid' or 'graph' or null
let previousSelectedTab = null; // Track the previously selected normal tab
let previousSelectedTabName = null; // Track the name of the previously selected normal tab

function addButtons() {
  const toolbar = $(".wide-toolbar");

  // GRID BUTTON
  toolbar.append(
    $("<button>")
      .attr("id", "show-grid")
      .addClass("wide-toolbar__item")
      .append(
        $("<img>")
          .addClass("wide-toolbar__item__icon")
          .attr("src", chrome.runtime.getURL("static/img/grid_icon.png"))
      )
      .append(
        $("<span>").addClass("wide-toolbar__item__name").text("Grid")
      )
      .click(() => switchToCustomTab('grid'))
  );

  // GRAPH BUTTON
  toolbar.append(
    $("<button>")
      .attr("id", "show-graph")
      .addClass("wide-toolbar__item")
      .append(
        $("<img>")
          .addClass("wide-toolbar__item__icon")
          .attr("src", chrome.runtime.getURL("static/img/graph_icon.png"))
      )
      .append(
        $("<span>").addClass("wide-toolbar__item__name").text("Graph")
      )
      .click(() => switchToCustomTab('graph'))
  );
}

// Create content area for custom tabs
function createCustomContentArea() {
  const smscMain = $("#smscMain");

  // Create custom content container
  const customContent = $("<div>")
    .attr("id", "custom-content-area")
    .css({
      display: "none",
      width: "100%",
      height: "100%",
      padding: "20px",
      boxSizing: "border-box"
    });

  // Insert after the toolbar
  const toolbar = smscMain.find(".wide-toolbar");
  if (toolbar.length > 0) {
    toolbar.after(customContent);
  } else {
    smscMain.append(customContent);
  }

  // Add swipe gesture detection
  setupSwipeGestures(customContent[0]);
}

// Set up swipe gesture detection for custom content area
function setupSwipeGestures(element) {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;

  element.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  element.addEventListener('touchend', function(e) {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipeGesture();
  }, { passive: true });

  function handleSwipeGesture() {
    if (!currentCustomTab) return; // Only handle if custom tab is open

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const minSwipeDistance = 50; // Minimum distance for swipe detection
    const maxVerticalMovement = 100; // Maximum vertical movement to consider it horizontal

    // Check if it's a horizontal swipe (not vertical)
    if (Math.abs(deltaY) < maxVerticalMovement && Math.abs(deltaX) > minSwipeDistance) {
      console.log(`[BetterResults] Swipe detected: ${deltaX > 0 ? 'right' : 'left'} (${Math.abs(deltaX)}px)`);

      // Close the custom tab
      $(`#show-${currentCustomTab}`).removeClass("wide-toolbar__item--selected");
      currentCustomTab = null;

      // Hide custom content and show main content
      $("#custom-content-area").hide();
      $("#smscMain > div:not(.wide-toolbar):not(#custom-content-area)").show();

      console.log('[BetterResults] Custom tab closed due to swipe gesture');

      // Send message to background script
      try {
        chrome.runtime.sendMessage({
          action: 'customTabClosed',
          closedBy: 'swipeGesture',
          direction: deltaX > 0 ? 'right' : 'left',
          timestamp: Date.now()
        });
      } catch (e) {
        console.log('[BetterResults] Could not send message to background script:', e.message);
      }
    }
  }
}

// Switch to custom tab (grid or graph)
function switchToCustomTab(tabType) {
  console.log(`[BetterResults] Switching to custom tab: ${tabType}`);

  const toolbar = $(".wide-toolbar");
  const customContent = $("#custom-content-area");

  // If clicking the same tab that's already selected, do nothing
  if (currentCustomTab === tabType) {
    console.log(`[BetterResults] Already on ${tabType}, no action needed`);
    return;
  }

  // If switching between grid and graph, just change content
  if (currentCustomTab && currentCustomTab !== tabType) {
    console.log(`[BetterResults] Switching from ${currentCustomTab} to ${tabType}`);
    $(`#show-${currentCustomTab}`).removeClass("wide-toolbar__item--selected");
    $(`#show-${tabType}`).addClass("wide-toolbar__item--selected");
    currentCustomTab = tabType;
    loadCustomContent(tabType);
    return;
  }

  // Deselect any currently selected normal tab and remember it
  const currentlySelected = toolbar.find(".wide-toolbar__item--selected");
  if (currentlySelected.length > 0 && !currentlySelected.is("#show-grid, #show-graph")) {
    currentlySelected.removeClass("wide-toolbar__item--selected");
    previousSelectedTab = currentlySelected[0];
    previousSelectedTabName = currentlySelected.find(".wide-toolbar__item__name").text().trim();
    console.log(`[BetterResults] Deselected normal tab: ${previousSelectedTabName}`);
  }

  // Select the new custom tab
  $(`#show-${tabType}`).addClass("wide-toolbar__item--selected");
  currentCustomTab = tabType;

  // Show custom content area and hide main content
  customContent.show();
  const mainContent = $("#smscMain > div:not(.wide-toolbar):not(#custom-content-area)");
  mainContent.hide();

  // Load the appropriate content
  loadCustomContent(tabType);

  // Set up hooks for normal buttons when opening custom tab
  setupNormalButtonHooks();

  console.log(`[BetterResults] Successfully opened ${tabType} tab`);

  // Send message to background script
  try {
    chrome.runtime.sendMessage({
      action: 'customTabOpened',
      tabType: tabType,
      timestamp: Date.now()
    });
  } catch (e) {
    console.log('[BetterResults] Could not send message to background script:', e.message);
  }
}

// Function to close custom tab and return to previous normal tab
function closeCustomTab() {
  if (!currentCustomTab) return;

  // Deselect current custom tab
  $(`#show-${currentCustomTab}`).removeClass("wide-toolbar__item--selected");
  currentCustomTab = null;

  // Hide custom content and show main content
  $("#custom-content-area").hide();
  $("#smscMain > div:not(.wide-toolbar):not(#custom-content-area)").show();

  // Reset previous tab tracking
  previousSelectedTab = null;
  previousSelectedTabName = null;
}

// Load custom content based on tab type
function loadCustomContent(tabType) {
  const customContent = $("#custom-content-area");
  customContent.empty();

  if (tabType === 'grid') {
    // Load grid content
    const gridContent = MakeGrid();
    customContent.append(gridContent);
  } else if (tabType === 'graph') {
    // Load graph content
    const graphContent = MakeGraph();
    customContent.append(graphContent);
  }
}

// Set up click handlers for all normal toolbar buttons using the user's hook code
function setupNormalButtonHooks() {
  console.log('[BetterResults] Setting up normal button hooks...');

  // Select the container using the user's approach
  const container = document.querySelector("#smscMain > div.wide-toolbar.js-wide-toolbar");

  if (container) {
    // Find all buttons without an ID inside the container (normal Smartschool buttons)
    const buttons = container.querySelectorAll("button:not([id])");

    console.log(`[BetterResults] Found ${buttons.length} normal buttons to hook into`);

    buttons.forEach((button, index) => {
      // Remove existing handler if any
      if (button.hookHandler) {
        button.removeEventListener("click", button.hookHandler);
      }

      // Hook into each button's click event
      button.hookHandler = (event) => {
        console.log(`[BetterResults] Normal button ${index} clicked`);

        if (currentCustomTab) {
          console.log(`[BetterResults] Custom tab ${currentCustomTab} is open, closing it`);

          // Close the custom tab
          $(`#show-${currentCustomTab}`).removeClass("wide-toolbar__item--selected");
          currentCustomTab = null;

          // Hide custom content and show main content
          $("#custom-content-area").hide();
          $("#smscMain > div:not(.wide-toolbar):not(#custom-content-area)").show();

          // Make sure the clicked button has the selected class
          if (!button.classList.contains("wide-toolbar__item--selected")) {
            console.log('[BetterResults] Adding selected class to clicked button');

            // First remove selected class from any other buttons
            const allButtons = container.querySelectorAll("button");
            allButtons.forEach(btn => {
              if (btn !== button) {
                btn.classList.remove("wide-toolbar__item--selected");
              }
            });

            // Add selected class to the clicked button
            button.classList.add("wide-toolbar__item--selected");
          }

          console.log('[BetterResults] Custom tab closed, normal button will now work');

          // Send message to background script
          try {
            chrome.runtime.sendMessage({
              action: 'customTabClosed',
              closedBy: 'normalButtonClick',
              buttonSelected: true,
              timestamp: Date.now()
            });
          } catch (e) {
            console.log('[BetterResults] Could not send message to background script:', e.message);
          }
        } else {
          console.log('[BetterResults] No custom tab open, normal button works normally');
        }
      };

      button.addEventListener("click", button.hookHandler);
      console.log(`[BetterResults] Hooked button ${index}`);
    });

    console.log(`[BetterResults] Successfully hooked into ${buttons.length} normal buttons`);

    // Send message to background script
    try {
      chrome.runtime.sendMessage({
        action: 'hooksSetup',
        buttonCount: buttons.length,
        timestamp: Date.now()
      });
    } catch (e) {
      console.log('[BetterResults] Could not send message to background script:', e.message);
    }
  } else {
    console.warn("[BetterResults] Toolbar container not found for button hooking!");
  }
}

// Set up URL change detection to close custom tabs when navigating
function setupURLChangeDetection() {
  console.log('[BetterResults] Setting up URL change detection...');

  let currentURL = window.location.href;

  // Method 1: Listen for popstate events (browser back/forward)
  window.addEventListener('popstate', function() {
    console.log('[BetterResults] popstate detected, checking for URL change');
    checkURLChange();
  });

  // Method 2: Override history methods to detect programmatic navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(state, title, url) {
    const result = originalPushState.apply(history, arguments);
    console.log('[BetterResults] pushState detected, checking for URL change');
    setTimeout(checkURLChange, 10); // Small delay to ensure URL has changed
    return result;
  };

  history.replaceState = function(state, title, url) {
    const result = originalReplaceState.apply(history, arguments);
    console.log('[BetterResults] replaceState detected, checking for URL change');
    setTimeout(checkURLChange, 10); // Small delay to ensure URL has changed
    return result;
  };

  // Method 3: Periodic check as fallback
  setInterval(() => {
    if (window.location.href !== currentURL) {
      console.log('[BetterResults] URL change detected via polling');
      checkURLChange();
    }
  }, 500);

  function checkURLChange() {
    const newURL = window.location.href;

    if (newURL !== currentURL && currentCustomTab) {
      console.log(`[BetterResults] URL changed from ${currentURL} to ${newURL}, closing custom tab`);

      // Close the custom tab
      $(`#show-${currentCustomTab}`).removeClass("wide-toolbar__item--selected");
      currentCustomTab = null;

      // Hide custom content and show main content
      $("#custom-content-area").hide();
      $("#smscMain > div:not(.wide-toolbar):not(#custom-content-area)").show();

      console.log('[BetterResults] Custom tab closed due to URL change');

      // Send message to background script
      try {
        chrome.runtime.sendMessage({
          action: 'customTabClosed',
          closedBy: 'urlChange',
          oldURL: currentURL,
          newURL: newURL,
          timestamp: Date.now()
        });
      } catch (e) {
        console.log('[BetterResults] Could not send message to background script:', e.message);
      }
    }

    currentURL = newURL;
  }

  console.log('[BetterResults] URL change detection setup complete');
}


// MARK: GRID view

function MakeGrid() {
   const loading = $("<div>").css({
     textAlign: "center",
     padding: "20px"
   }).html(`
     <img src="https://static2.smart-school.net/smsc/svg/spinner/spinner_64x64.svg" style="width: 48px; height: 48px;" alt="Loading...">
     <h3 style="margin-top: 10px;">Loading…</h3>
   `);

   // Year selector container
   const yearSelectorContainer = $("<div>")
     .attr("id", "year-selector-container")
     .css({
       display: "flex",
       alignItems: "center",
       gap: "10px",
       marginBottom: "10px"
     });

   // Year selector dropdown
   const yearSelect = $("<select>")
     .attr("id", "year-selector")
     .css({
       padding: "5px 10px",
       borderRadius: "4px",
       border: "1px solid #ddd"
     });

   // Apply button
   const applyYearBtn = $("<button>")
     .attr("id", "apply-year-btn")
     .text("Apply")
     .addClass("period_button-grid")
     .css({
       padding: "5px 15px",
       backgroundColor: "#007bff",
       color: "white",
       border: "none",
       borderRadius: "4px",
       cursor: "pointer"
     });

   // Status text
   const statusText = $("<span>")
     .attr("id", "year-selector-status")
     .text("Loading years...")
     .css({
       fontSize: "12px",
       color: "#666",
       marginLeft: "10px"
     });

   yearSelectorContainer.append(
     $("<span>").text("Select Year: "),
     yearSelect,
     applyYearBtn,
     statusText
   );

   // Function to fetch evaluations for a specific year
   function fetchEvaluationsForYear(startYear) {
     const startDate = `${startYear}-09-01`;
     const endDate = `${startYear + 1}-08-31`;
     const url = `/results/api/v1/evaluations?pageNumber=1&itemsOnPage=500&startDate=${startDate}&endDate=${endDate}`;

     console.log(`[BetterResults] Fetching evaluations for year ${startYear}: ${url}`);
     return fetch(url).then(r => r.json());
   }

   // Function to find available school years
   function findAvailableYears() {
     const currentDate = new Date();
     const currentYear = currentDate.getFullYear();
     const currentMonth = currentDate.getMonth() + 1; // getMonth() returns 0-11

     // Determine current school year
     // School year starts in September, so if we're before September, we're in the previous year
     const currentSchoolYear = currentMonth < 9 ? currentYear - 1 : currentYear;

     console.log(`[BetterResults] Current school year: ${currentSchoolYear}`);

     const years = [];
     let yearToCheck = currentSchoolYear;

     // Try current year first
     return fetchEvaluationsForYear(yearToCheck)
       .then(results => {
         const gradeCount = results.filter(r => r.type === "normal").length;
         if (gradeCount > 0) {
           years.push({ year: yearToCheck, count: gradeCount });
         }

         // Continue checking previous years until we find one with no grades
         function checkNextYear() {
           yearToCheck--;
           return fetchEvaluationsForYear(yearToCheck)
             .then(results => {
               const gradeCount = results.filter(r => r.type === "normal").length;
               if (gradeCount > 0) {
                 years.push({ year: yearToCheck, count: gradeCount });
                 return checkNextYear(); // Continue checking
               } else {
                 // No more grades found, stop here
                 return years;
               }
             });
         }

         return checkNextYear();
       })
       .then(() => {
         // Sort years descending (newest first)
         return years.sort((a, b) => b.year - a.year);
       });
   }

     // Get current school year and load it first
     const currentDate = new Date();
     const currentMonth = currentDate.getMonth() + 1;
     let currentSchoolYear = currentMonth < 9 ? currentDate.getFullYear() - 1 : currentDate.getFullYear();
     let displayYear = currentSchoolYear; // Track which year we're actually displaying

     console.log(`[BetterResults] Current school year: ${currentSchoolYear}`);

     // Function to load year data with fallback logic
     function loadYearWithFallback(yearToLoad) {
       statusText.text(`Loading year (${yearToLoad}-${yearToLoad + 1})...`);

       return fetchEvaluationsForYear(yearToLoad)
         .then((results) => {
           console.log(`[BetterResults] Loaded year ${yearToLoad} data: ${results.length} results`);
           const gradeCount = results.filter(r => r.type === "normal").length;

           // If this is the current year and no grades found, try previous year
           if (yearToLoad === currentSchoolYear && gradeCount === 0) {
             console.log(`[BetterResults] No grades found for current year ${currentSchoolYear}, trying previous year`);
             const previousYear = currentSchoolYear - 1;
             displayYear = previousYear; // Update display year to previous year

             return loadYearWithFallback(previousYear);
           }

           return { results, year: yearToLoad, gradeCount };
         });
     }

     // Load data with fallback logic
     loadYearWithFallback(currentSchoolYear)
       .then(({ results, year, gradeCount }) => {
         // Add the displayed year to selector
         yearSelect.empty();
         const yearOption = $("<option>")
           .attr("value", year)
           .text(`${year}-${year + 1} (${gradeCount} grades)`);
         yearSelect.append(yearOption);
         yearSelect.val(year);

         // Start loading other years in the background
         findAvailableYears()
           .then(availableYears => {
             console.log(`[BetterResults] Found ${availableYears.length} total years with grades:`, availableYears);

             // Update selector with all available years
             yearSelect.empty();
             availableYears.forEach(yearData => {
               const option = $("<option>")
                 .attr("value", yearData.year)
                 .text(`${yearData.year}-${yearData.year + 1} (${yearData.count} grades)`);
               yearSelect.append(option);
             });

             // Keep the displayed year selected (could be fallback year)
             yearSelect.val(displayYear);
             statusText.text(`Found ${availableYears.length} years with grades`);
           })
           .catch(error => {
             console.error("[BetterResults] Error loading additional years:", error);
             statusText.text(`Loaded year (${displayYear}-${displayYear + 1})`);
           });

         // Process and display the loaded year data immediately
         return { results, year, gradeCount };
       })
       .then(({ results, year, gradeCount }) => {
        /* Structure: { [period]: { [course]: result[] } } */
        let data = {};
        let courseIcons = {};
        let latestPeriod = null;
        let allResults = [];

      /* --- Parse Smartschool API payload -------------------------------- */
      results.forEach((res) => {
        if (res.type !== "normal") return;
        
        allResults.push(res);

        const period = res.period.name;
        latestPeriod ??= period;
        data[period] ??= {};

        res.courses.forEach((course) => {
          const name = course.name;
          data[period][name] ??= [];
          data[period][name].push({
            date: res.date,
            name: res.name,
            graphic: res.graphic,
          });
          courseIcons[name] = course.graphic;
        });
      });

      function buildGridWithFilter(filteredResults = null) {
        const resultsToUse = filteredResults || allResults;
        
        const filteredData = {};
        
        resultsToUse.forEach((res) => {
          if (res.type !== "normal") return;
          
          const period = res.period.name;
          filteredData[period] ??= {};
          
          res.courses.forEach((course) => {
            const name = course.name;
            filteredData[period][name] ??= [];
            filteredData[period][name].push({
              date: res.date,
              name: res.name,
              graphic: res.graphic,
            });
          });
        });
        
        const periodGrids = buildPeriodGrids(filteredData, courseIcons);
        return periodGrids;
      }
      
      function buildPeriodGrids(data, courseIcons) {
        const periodGrids = {};
        
        Object.entries(data).forEach(([periodName, periodData]) => {
          const grid = $("<div>").attr("id", "period-grid");
          grid.append($("<h2>").text(`${periodName}:`));

          const table = $("<table>").attr("id", "result-table-grid");
          grid.append($("<div>").attr("id", "table-container-grid").append(table));

          let maxLen = 0;
          Object.values(periodData).forEach((course) => {
            course.sort((a, b) => a.date.localeCompare(b.date));
            maxLen = Math.max(maxLen, course.length);
          });

          const discRow = $("<tr>");
          for (let i = 0; i < maxLen + 1; i++) discRow.append($("<td>").addClass("hidden-cell-grid"));
          discRow.append($("<td>").attr("id", "disclamer-grid").text("!"));
          table.append(discRow);

          let overallNum = 0;
          let overallDen = 0;

           Object.entries(periodData).forEach(([courseName, results]) => {
             const row = $("<tr>").addClass("course-row");

              const icon = courseIcons[courseName];
              const courseNameCell = $("<th>").addClass("course-name-cell");

              if (icon && icon.type === "icon" && icon.value) {
                // Create container for icon and text
                const iconContainer = $("<div>").addClass("course-icon-container");

                // Load SVG icon directly from the URL
                const iconImg = $("<img>")
                  .attr("src", `https://static2.smart-school.net/smsc/svg/${icon.value}/${icon.value}_24x24.svg`)
                  .attr("alt", `${courseName} icon`)
                  .addClass("course-icon")
                  .css({
                    width: "24px",
                    height: "24px",
                    marginRight: "8px",
                    verticalAlign: "middle"
                  })
                  .on("error", function() {
                    // If SVG fails to load, hide the image
                    $(this).hide();
                  });

                // Add icon and course name
                iconContainer.append(iconImg);
                iconContainer.append($("<span>").text(courseName));
                courseNameCell.append(iconContainer);
              } else {
                // No icon available, just show course name
                courseNameCell.text(courseName);
              }

              row.append(courseNameCell);

             let num = 0;
             let den = 0;
             results.forEach(({ name, graphic }, index) => {
               const { description: desc = "/", color } = graphic;
               const cell = $("<td>")
                 .addClass(`c-${color}-combo--300 evaluation-cell`)
                 .attr({ id: "details-grid", content: name })
                 .text(desc);

               // Add visual grouping for multiple evaluations
               if (results.length > 1) {
                 cell.addClass("multi-evaluation");
               }

               row.append(cell);

               const m = /^([\d,.]+)\/([\d,.]+)$/.exec(desc);
               if (m) {
                 num += parseFloat(m[1].replace(",", "."));
                 den += parseFloat(m[2].replace(",", "."));
               }
             });

             for (let i = 0; i < maxLen - results.length; i++) row.append($("<td>").addClass("empty-cell"));

             const totalCell = $("<td>").addClass("total-grid course-total");
             if (den) {
               totalCell.text(ratioToPercent(num, den));
               if (num / den < 0.5) totalCell.addClass("is-low-grid");
             }
             row.append(totalCell);

             overallNum += num;
             overallDen += den;
             table.append(row);
           });

           const overallRow = $("<tr>").addClass("overall-total-row");
           overallRow.append($("<th>").addClass("overall-total-label").text("OVERALL TOTAL"));
           for (let i = 0; i < maxLen; i++) overallRow.append($("<td>").addClass("overall-spacer"));

           const overallCell = $("<td>").addClass("total-grid overall-total-value");
           if (overallDen) {
             overallCell.text(ratioToPercent(overallNum, overallDen));
             if (overallNum / overallDen < 0.5) overallCell.addClass("is-low-grid");
           }
           overallRow.append(overallCell);
           table.append(overallRow);

          periodGrids[periodName] = grid;
        });
        
        return periodGrids;
      }

      const periodGrids = buildGridWithFilter();
      
       /* --- Build the modal wrapper -------------------------------------- */
       const modal = $("<div>").attr("id", "content-container-grid");
       const periodButtons = $("<div>").attr("id", "period-buttons");
       const mainGrid = $("<div>").attr("id", "period-container-grid");

       modal.append(yearSelectorContainer);

        // Move selectedPeriods to outer scope so it can be accessed by createCombinedGrid
        let selectedPeriods = new Set();
        let isProcessingClick = false; // Prevent rapid clicking

        // Function to synchronize button CSS with backend state
        function syncButtonStates() {
          $('.period-button-grid').each(function() {
            const $btn = $(this);
            const period = $btn.data('period');
            const isSelected = selectedPeriods.has(period);

            if (isSelected) {
              $btn.css({
                backgroundColor: "#007bff",
                borderColor: "#007bff",
                color: "white"
              }).addClass('period-button-initial-selected');
            } else {
              $btn.css({
                backgroundColor: "white",
                borderColor: "#ddd",
                color: "black"
              }).removeClass('period-button-initial-selected');
            }
          });
        }

        function updatePeriodButtons(grids) {
          periodButtons.empty();

          const periodLabel = $("<div>").text("Select Periods:").css({
            "font-weight": "bold",
            "margin-bottom": "0.5rem"
          });
          const periodButtonsContainer = $("<div>").attr("id", "period-buttons-grid").css({
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginBottom: "1rem"
          });

          Object.keys(grids).reverse().forEach(periodName => {
             const button = $("<button>")
               .addClass("period-button-grid")
               .text(periodName)
               .attr("data-period", periodName)
               .data("period", periodName)
               .css({
                 padding: "0.5rem 1rem",
                 border: "2px solid #ddd",
                 borderRadius: "4px",
                 backgroundColor: "white",
                 cursor: "pointer",
                 transition: "all 0.2s ease"
               })
               .hover(
                 function() {
                   // Only apply hover effect if button is not currently selected
                   if ($(this).css('backgroundColor') !== 'rgb(0, 123, 255)' &&
                       !$(this).hasClass('period-button-initial-selected')) {
                     $(this).css({
                       backgroundColor: "#e7f3ff",
                       borderColor: "#007bff",
                       color: "#004085"
                     });
                   }
                 },
                 function() {
                   // Only apply default styling if button is not currently selected
                   if ($(this).css('backgroundColor') !== 'rgb(0, 123, 255)' &&
                       !$(this).hasClass('period-button-initial-selected')) {
                     $(this).css({
                       backgroundColor: "white",
                       borderColor: "#ddd",
                       color: "black"
                     });
                   }
                 }
               )
                .on("click", function() {
                  const $btn = $(this);
                  const period = $btn.data("period");

                  // Prevent rapid clicking
                  if (isProcessingClick) {
                    console.log(`[BetterResults] Ignoring rapid click for period: ${period}`);
                    return;
                  }

                  isProcessingClick = true;
                  console.log(`[BetterResults] Button clicked for period: ${period}`);

                  // Add visual feedback - reduce opacity and change cursor
                  $btn.css({
                    opacity: 0.7,
                    cursor: 'not-allowed',
                    pointerEvents: 'none'
                  });

                  // Remove initial-selected class from all buttons when user interacts
                  $('.period-button-grid').removeClass('period-button-initial-selected');

                  // Update backend state
                  if (selectedPeriods.has(period)) {
                    selectedPeriods.delete(period);
                  } else {
                    selectedPeriods.add(period);
                  }

                  // Sync CSS with backend state
                  syncButtonStates();

                  // Load combined grid with small delay to prevent race conditions
                  setTimeout(() => {
                    loadCombinedGrid();
                    isProcessingClick = false;
                    // Restore visual feedback
                    $btn.css({
                      opacity: 1,
                      cursor: 'pointer',
                      pointerEvents: 'auto'
                    });
                  }, 50);
                });

            periodButtonsContainer.append(button);
          });

           periodButtons.append(periodLabel, periodButtonsContainer);




          // Initialize with latest period selected
          if (latestPeriod && grids[latestPeriod]) {
            selectedPeriods.add(latestPeriod);
            console.log(`[BetterResults] Selecting latest period: ${latestPeriod}`);

            // Use setTimeout to ensure DOM is ready
            setTimeout(() => {
              // Sync all button states to ensure consistency
              syncButtonStates();
              console.log(`[BetterResults] Applied initial selection styling to ${latestPeriod}`);
            }, 100);

            loadCombinedGrid();
          }
         }

         function loadCombinedGrid() {
           mainGrid.empty();

           // Create combined table with original grid design
           const combinedTable = createCombinedGrid();
           mainGrid.append(combinedTable);
         }

         function createCombinedGrid() {
          if (selectedPeriods.size === 0) {
            return $("<p>").text("Please select at least one period.");
          }

          const tableContainer = $("<div>").attr("id", "combined-table-container").css({
            overflowX: "auto",
            overflowY: "visible",
            position: "relative",
            maxWidth: "100%"
          });

          const table = $("<table>").attr("id", "combined-result-table");

          // Create header row - just like original grid
          const headerRow = $("<tr>");
          headerRow.append($("<th>").text("Course").css({
            position: "sticky",
            left: 0,
            backgroundColor: "#f8f9fa",
            zIndex: 10,
            minWidth: "200px",
            textAlign: "left",
            fontWeight: "bold"
          }));

          // Add evaluation columns - we need to find the maximum number of evaluations
          let maxEvaluations = 0;
          const allCourses = new Set();
          const courseData = {};

          selectedPeriods.forEach(periodName => {
            if (data[periodName]) {
              Object.keys(data[periodName]).forEach(courseName => {
                allCourses.add(courseName);
                if (!courseData[courseName]) {
                  courseData[courseName] = [];
                }
                // Add all evaluations from this period to the course
                courseData[courseName] = courseData[courseName].concat(data[periodName][courseName]);
                maxEvaluations = Math.max(maxEvaluations, courseData[courseName].length);
              });
            }
          });

           // Add evaluation column headers
           for (let i = 1; i <= maxEvaluations; i++) {
             headerRow.append($("<th>").text("").css({
               textAlign: "center",
               backgroundColor: "#f8f9fa",
               fontWeight: "bold",
               minWidth: "100px"
             }));
           }

           // Add total column with disclaimer styling
           const totalHeader = $("<th>")
             .attr("id", "disclamer-grid")
             .text("Total")
             .css({
               position: "sticky",
               right: 0,
               backgroundColor: "#ffebee",
               zIndex: 10,
               fontWeight: "bold",
               minWidth: "80px",
               textAlign: "center",
               cursor: "help",
               position: "relative",
               border: "2px solid #ffcdd2",
               color: "#c62828"
             });

           headerRow.append(totalHeader);

           table.append(headerRow);

           // Create data rows for each course - just like original grid
          Array.from(allCourses).sort().forEach(courseName => {
            const row = $("<tr>").addClass("course-row");

            // Course name cell with icon
            const courseNameCell = $("<th>").css({
              position: "sticky",
              left: 0,
              backgroundColor: "white",
              zIndex: 5,
              textAlign: "left",
              fontWeight: "normal"
            });

            const icon = courseIcons[courseName];
            if (icon && icon.type === "icon" && icon.value) {
              // Create container for icon and text
              const iconContainer = $("<div>").addClass("course-icon-container");

              // Load SVG icon directly from the URL
              const iconImg = $("<img>")
                .attr("src", `https://static2.smart-school.net/smsc/svg/${icon.value}/${icon.value}_24x24.svg`)
                .attr("alt", `${courseName} icon`)
                .addClass("course-icon")
                .css({
                  width: "24px",
                  height: "24px",
                  marginRight: "8px",
                  verticalAlign: "middle"
                })
                .on("error", function() {
                  // If SVG fails to load, hide the image
                  $(this).hide();
                });

              // Add icon and course name
              iconContainer.append(iconImg);
              iconContainer.append($("<span>").text(courseName));
              courseNameCell.append(iconContainer);
            } else {
              // No icon available, just show course name
              courseNameCell.text(courseName);
            }

            row.append(courseNameCell);

            let totalNum = 0;
            let totalDen = 0;

            // Sort evaluations by date (earliest first) and add evaluation cells
            const evaluations = (courseData[courseName] || []).sort((a, b) => {
              return new Date(a.date) - new Date(b.date);
            });

            evaluations.forEach((evaluation, index) => {
              // Parse the score to get percentage for tooltip
              const match = evaluation.graphic.description.match(/([\d,.]+)\/([\d,.]+)/);
              let percentage = 0;
              if (match) {
                const num = parseFloat(match[1].replace(',', '.'));
                const den = parseFloat(match[2].replace(',', '.'));
                percentage = Math.round(num / den * 1000) / 10;
                totalNum += num;
                totalDen += den;
              }

              // Find which period this evaluation belongs to
              let periodName = "Unknown Period";
              selectedPeriods.forEach(p => {
                if (data[p] && data[p][courseName]) {
                  const found = data[p][courseName].find(e => e.date === evaluation.date && e.name === evaluation.name);
                  if (found) {
                    periodName = p;
                  }
                }
              });

              const evalCell = $("<td>")
                .addClass(`c-${evaluation.graphic.color}-combo--300`)
                .attr({
                  id: "details-grid",
                  'data-name': evaluation.name,
                  'data-score': evaluation.graphic.description,
                  'data-percentage': percentage,
                  'data-period': periodName,
                  'data-color': evaluation.graphic.color
                })
                .text(evaluation.graphic.description)
                .css({
                  textAlign: "center",
                  padding: "4px 8px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  position: "relative"
                });

              evalCell.hover(
                function() { showTooltip($(this)); },
                function() { hideTooltip(); }
              );

              row.append(evalCell);
            });

            // Add empty cells if this course has fewer evaluations than the maximum
            for (let i = evaluations.length; i < maxEvaluations; i++) {
              row.append($("<td>").text(""));
            }

            // Add total cell - just like original grid
            const totalCell = $("<td>").addClass("total-grid").css({
              position: "sticky",
              right: 0,
              backgroundColor: "white",
              zIndex: 5,
              fontWeight: "bold",
              textAlign: "center",
              minWidth: "80px"
            });

            if (totalDen > 0) {
              const percentage = Math.round(totalNum / totalDen * 1000) / 10;
              totalCell.text(percentage + '%');
              if (percentage < 50) {
                totalCell.css('color', 'red');
              }
            } else {
              totalCell.text("-");
            }

            row.append(totalCell);
            table.append(row);
          });

          // Add overall total row - just like original grid
          const overallRow = $("<tr>").addClass("overall-total-row");
          overallRow.append($("<th>").text("OVERALL TOTAL").css({
            position: "sticky",
            left: 0,
            backgroundColor: "#e3f2fd",
            zIndex: 5,
            textAlign: "left",
            fontWeight: "bold"
          }));

          let overallNum = 0;
          let overallDen = 0;

          // Calculate overall totals across all courses and periods
          Array.from(allCourses).forEach(courseName => {
            const evaluations = courseData[courseName] || [];
            evaluations.forEach(evaluation => {
              const match = evaluation.graphic.description.match(/([\d,.]+)\/([\d,.]+)/);
              if (match) {
                overallNum += parseFloat(match[1].replace(',', '.'));
                overallDen += parseFloat(match[2].replace(',', '.'));
              }
            });
          });

          // Add empty cells for each evaluation column
          for (let i = 0; i < maxEvaluations; i++) {
            overallRow.append($("<td>").text(""));
          }

          // Add overall total cell
          const overallTotalCell = $("<td>").addClass("total-grid").css({
            position: "sticky",
            right: 0,
            backgroundColor: "#e3f2fd",
            zIndex: 5,
            textAlign: "center",
            fontSize: "1.2em",
            fontWeight: "bold",
            color: "#1976d2"
          });

          if (overallDen > 0) {
            const percentage = Math.round(overallNum / overallDen * 1000) / 10;
            overallTotalCell.text(percentage + '%');
            if (percentage < 50) {
              overallTotalCell.css('color', 'red');
            }
          } else {
            overallTotalCell.text("-");
          }

          overallRow.append(overallTotalCell);
          table.append(overallRow);

          tableContainer.append(table);
          return tableContainer;
        }

        // Tooltip functions for grid
        function showTooltip($cell) {
          const name = $cell.attr('data-name');
          const score = $cell.attr('data-score');
          const percentage = $cell.attr('data-percentage');
          const period = $cell.attr('data-period');
          const color = $cell.attr('data-color');

          // Remove any existing tooltip
          $('.grid-tooltip').remove();

          // Create tooltip element — styling mirrors Chart.js tooltip used in the
          // graph: semi-transparent evaluation color background, black text,
          // small border, rounded corners and subtle shadow.
          const raw = getTooltipColor(color);
          const bgRgba = hexToRgba(raw, 0.5); // 50% opacity similar to chart
          const arrowRgba = hexToRgba(raw, 0.9); // slightly more opaque for arrow
          const textColor = getTooltipTextColor(color);

          const tooltip = $('<div>')
            .addClass('grid-tooltip')
            .css({
              position: 'absolute',
              // set CSS variable so pseudo-element arrow can match the color
              '--bg': arrowRgba,
              color: textColor,
              padding: '8px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              zIndex: 10000,
              pointerEvents: 'none',
              whiteSpace: 'pre-line',
              textAlign: 'left',
              fontWeight: 'normal',
              lineHeight: '1.2',
              backgroundColor: bgRgba,
              border: '1px solid rgba(0,0,0,0.12)',
              boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
              opacity: 0,
              transform: 'scale(0.9)',
              transition: 'all 0.2s ease'
            })
            .text(`${name}\n${score} (${percentage}%) - ${period}`);

          // Append first so outerWidth/outerHeight are correct, then position.
          $('body').append(tooltip);

          const cellOffset = $cell.offset();
          const cellWidth = $cell.outerWidth();
          const cellHeight = $cell.outerHeight();
          const tipW = tooltip.outerWidth();
          const tipH = tooltip.outerHeight();

          // Smart positioning: prefer right, but switch to left if it would go off screen
          const viewportW = $(window).width();
          const viewportH = $(window).height();
          let left = cellOffset.left + cellWidth + 4;
          let arrowClass = 'arrow-right';

          // Check if tooltip would go off the right edge of the screen
          if (left + tipW > viewportW - 4) {
            // Switch to left side
            left = cellOffset.left - tipW - 4;
            arrowClass = 'arrow-left';
          }

          // If left positioning would also go off screen, keep right positioning
          if (left < 4) {
            left = cellOffset.left + cellWidth + 4;
            arrowClass = 'arrow-right';
          }

          let top = cellOffset.top + (cellHeight / 2) - (tipH / 2);

          // Smart vertical positioning: keep tooltip within viewport bounds
          const margin = 8;

          // If tooltip would go above viewport, push it down
          if (top < margin) {
            top = margin;
          }

          // If tooltip would go below viewport, push it up
          if (top + tipH > viewportH - margin) {
            top = viewportH - tipH - margin;
          }

          tooltip.addClass(arrowClass).css({ left, top });

          // Animate in
          setTimeout(() => {
            tooltip.css({
              opacity: 1,
              transform: 'scale(1)'
            });
          }, 10);
        }

        function hideTooltip() {
          $('.grid-tooltip').fadeOut(150, function() {
            $(this).remove();
          });
        }

        function getTooltipColor(color) {
          switch(color) {
            case 'red': return '#ff0000';
            case 'yellow': return '#ffd531';
            case 'green': return '#3bd63d';
            case 'olive': return '#2b8114';
            default: return '#1a1a1a';
          }
        }

        function getTooltipTextColor(color) {
          // Chart tooltip uses black for body/title; prefer black text for
          // light backgrounds, white for darker ones.
          switch(color) {
            case 'red': return '#ffffff';
            case 'yellow': return '#000000';
            case 'lightgreen': return '#000000';
            case 'darkgreen': return '#ffffff';
            default: return '#000000';
          }
        }

          // Convert a hex color (#RRGGBB or #RGB) to rgba(...) string with given
          // alpha (0..1). This is more compatible than 8-digit hex in CSS.
          function hexToRgba(hex, alpha = 0.5) {
            if (!hex) return `rgba(26,26,26,${alpha})`;
            // Strip leading #
            hex = hex.replace('#','');
            if (hex.length === 3) {
              hex = hex.split('').map(c => c + c).join('');
            }
            const int = parseInt(hex, 16);
            const r = (int >> 16) & 255;
            const g = (int >> 8) & 255;
            const b = int & 255;
            return `rgba(${r},${g},${b},${alpha})`;
          }

         updatePeriodButtons(periodGrids);

         // Store export functions globally for access from buttons
         window.extractGridData = function() {
           console.log("[BetterResults] Extracting detailed grid data for export...");

           // Try multiple table selectors in case the table structure is different
           let table = $("#combined-result-table");
           if (table.length === 0) {
             console.log("[BetterResults] combined-result-table not found, trying result-table-grid");
             table = $("#result-table-grid");
           }
           if (table.length === 0) {
             console.log("[BetterResults] No tables found with expected IDs");
             console.log("[BetterResults] Available tables:", $('table').length);
             $('table').each(function(i) {
               console.log(`[BetterResults] Table ${i} ID:`, $(this).attr('id'));
             });
             alert("No grid data found to export. Please ensure the grid is loaded and try again.");
             return null;
           }

           console.log("[BetterResults] Found table:", table.attr('id'));
           console.log("[BetterResults] Table rows:", table.find("tr").length);

           const tableData = [];
           const headers = [];

           // Extract headers - try different approaches
           let headerRow = table.find("thead tr:first");
           if (headerRow.length === 0) {
             headerRow = table.find("tbody tr:first");
           }

           headerRow.find("th, td").each(function() {
             headers.push($(this).text().trim());
           });

           console.log("[BetterResults] Extracted headers:", headers);

           // Extract data rows (skip header row if it's in tbody)
           let dataRows = table.find("tbody tr");
           if (dataRows.length === 0) {
             dataRows = table.find("tr");
             dataRows = dataRows.slice(1); // Skip first row if it's headers
           }

           console.log("[BetterResults] Processing data rows:", dataRows.length);

           dataRows.each(function(index) {
             const row = [];
             $(this).find("th, td").each(function() {
               row.push($(this).text().trim());
             });
             if (row.length > 0 && row.some(cell => cell !== "")) {
               tableData.push(row);
             }
           });

           console.log("[BetterResults] Extracted data rows:", tableData.length);
           console.log("[BetterResults] Sample data:", tableData.slice(0, 3));

           if (tableData.length === 0) {
             alert("No data rows found in the grid. The table might be empty.");
             return null;
           }

           return { headers, data: tableData };
         };

          // Enhanced CSV export with detailed test information and selection popup
          window.exportToCsvDetailed = function() {
            console.log("[BetterResults] Starting detailed CSV export...");

            // Get the currently selected year from the year selector
            const selectedYear = parseInt(yearSelect.val());
            if (!selectedYear) {
              alert("Please select a year first");
              return;
            }

            console.log(`[BetterResults] Exporting data for year: ${selectedYear}`);

            // Show popup immediately with loading state
            showExportSelectionPopup(null, null, true);

            // Use the already loaded data for the selected year
            // The data is already available in the global variables
            console.log("[BetterResults] Using already loaded data for export");

            // Update popup with the current data
            updateExportSelectionPopup(data, latestPeriod);
          };

         // Function to show export selection popup
         function showExportSelectionPopup(data, latestPeriod, isLoading = false) {
           // Create popup overlay
           const overlay = $("<div>")
             .attr("id", "export-selection-overlay")
             .css({
               position: "fixed",
               top: 0,
               left: 0,
               width: "100%",
               height: "100%",
               backgroundColor: "rgba(0,0,0,0.5)",
               zIndex: 10000,
               display: "flex",
               alignItems: "center",
               justifyContent: "center"
             });

           // Create popup content
           const popup = $("<div>")
             .attr("id", "export-selection-popup")
             .css({
               backgroundColor: "white",
               borderRadius: "12px",
               padding: "24px",
               boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
               maxWidth: "600px",
               width: "90%",
               maxHeight: "80vh",
               overflow: "auto"
             });

           // Header
           const header = $("<div>")
             .css({
               fontSize: "18px",
               fontWeight: "bold",
               marginBottom: "20px",
               textAlign: "center",
               color: "#333"
             });

           if (isLoading) {
             header.html("Loading Data... <span style='font-size: 14px; font-weight: normal;'>Please wait</span>");
           } else {
             header.text("Select Data to Export");
           }

            // Loading state
            if (isLoading) {
              const loadingSpinner = $("<div>")
                .css({
                  textAlign: "center",
                  padding: "40px",
                  color: "#666"
                })
                .html(`
                  <img src="https://static2.smart-school.net/smsc/svg/spinner/spinner_64x64.svg" style="width: 64px; height: 64px; margin: 0 auto 20px;" alt="Loading...">
                  <div>Fetching your evaluation data...</div>
                `);

              popup.append(header, loadingSpinner);
              overlay.append(popup);
              $("body").append(overlay);

              return;
            }

           // Period selection
           const periodSection = $("<div>").css({ marginBottom: "20px" });
           const periodLabel = $("<div>")
             .css({ fontWeight: "bold", marginBottom: "8px" })
             .text("Select Periods:");
           const periodContainer = $("<div>")
             .css({ display: "flex", flexWrap: "wrap", gap: "8px" });

           const selectedPeriods = new Set([latestPeriod]); // Default to latest period

           Object.keys(data).reverse().forEach(periodName => {
             const isSelected = selectedPeriods.has(periodName);
             const periodButton = $("<button>")
               .text(periodName)
               .css({
                 padding: "6px 12px",
                 border: `2px solid ${isSelected ? "#007bff" : "#ddd"}`,
                 backgroundColor: isSelected ? "#007bff" : "white",
                 color: isSelected ? "white" : "black",
                 borderRadius: "6px",
                 cursor: "pointer",
                 fontSize: "14px",
                 transition: "all 0.2s ease"
               })
               .on("click", function() {
                 if (selectedPeriods.has(periodName)) {
                   selectedPeriods.delete(periodName);
                   $(this).css({
                     backgroundColor: "white",
                     color: "black",
                     borderColor: "#ddd"
                   });
                 } else {
                   selectedPeriods.add(periodName);
                   $(this).css({
                     backgroundColor: "#007bff",
                     color: "white",
                     borderColor: "#007bff"
                   });
                 }
                 // Update course selection when periods change
                 updateCourseSelection(data, selectedPeriods, courseContainer, selectedCourses);
               });

             periodContainer.append(periodButton);
           });

           periodSection.append(periodLabel, periodContainer);

           // Course selection
           const courseSection = $("<div>").css({ marginBottom: "20px" });
           const courseLabel = $("<div>")
             .css({ fontWeight: "bold", marginBottom: "8px" })
             .text("Select Courses:");
           const courseContainer = $("<div>")
             .css({ display: "flex", flexWrap: "wrap", gap: "8px" });

           // Get all unique courses from selected periods
           const allCourses = new Set();
           selectedPeriods.forEach(period => {
             if (data[period]) {
               Object.keys(data[period]).forEach(course => allCourses.add(course));
             }
           });

           const selectedCourses = new Set(allCourses); // Default to all courses

           Array.from(allCourses).sort().forEach(courseName => {
             const isSelected = selectedCourses.has(courseName);
             const courseButton = $("<button>")
               .text(courseName)
               .css({
                 padding: "6px 12px",
                 border: `2px solid ${isSelected ? "#28a745" : "#ddd"}`,
                 backgroundColor: isSelected ? "#28a745" : "white",
                 color: isSelected ? "white" : "black",
                 borderRadius: "6px",
                 cursor: "pointer",
                 fontSize: "14px",
                 transition: "all 0.2s ease"
               })
               .on("click", function() {
                 if (selectedCourses.has(courseName)) {
                   selectedCourses.delete(courseName);
                   $(this).css({
                     backgroundColor: "white",
                     color: "black",
                     borderColor: "#ddd"
                   });
                 } else {
                   selectedCourses.add(courseName);
                   $(this).css({
                     backgroundColor: "#28a745",
                     color: "white",
                     borderColor: "#28a745"
                   });
                 }
               });

             courseContainer.append(courseButton);
           });

           courseSection.append(courseLabel, courseContainer);

           // Sorting options
           const sortSection = $("<div>").css({ marginBottom: "20px" });
           const sortLabel = $("<div>")
             .css({ fontWeight: "bold", marginBottom: "8px" })
             .text("Sort Results By:");
           const sortContainer = $("<div>")
             .css({ display: "flex", flexDirection: "column", gap: "6px" });

           let selectedSort = "date"; // Default sort

           const sortOptions = [
             { value: "date", label: "Date (chronological)" },
             { value: "period_subject", label: "Period + Subject" },
             { value: "subject_date", label: "Subject + Date/Period" }
           ];

           sortOptions.forEach(option => {
             const isSelected = selectedSort === option.value;
             const sortRadio = $("<label>")
               .css({
                 display: "flex",
                 alignItems: "center",
                 padding: "8px 12px",
                 border: `2px solid ${isSelected ? "#17a2b8" : "#ddd"}`,
                 backgroundColor: isSelected ? "#17a2b8" : "white",
                 color: isSelected ? "white" : "black",
                 borderRadius: "6px",
                 cursor: "pointer",
                 fontSize: "14px",
                 transition: "all 0.2s ease"
               })
               .html(`
                 <input type="radio" name="sortOption" value="${option.value}" ${isSelected ? "checked" : ""} style="margin-right: 8px;">
                 ${option.label}
               `)
               .on("click", function() {
                 selectedSort = option.value;
                 // Update visual selection
                 sortContainer.find("label").css({
                   backgroundColor: "white",
                   color: "black",
                   borderColor: "#ddd"
                 });
                 $(this).css({
                   backgroundColor: "#17a2b8",
                   color: "white",
                   borderColor: "#17a2b8"
                 });
               });

             sortContainer.append(sortRadio);
           });

           sortSection.append(sortLabel, sortContainer);

           // Buttons
           const buttonContainer = $("<div>")
             .css({
               display: "flex",
               gap: "12px",
               justifyContent: "center",
               marginTop: "24px"
             });

           const cancelButton = $("<button>")
             .text("Cancel")
             .css({
               padding: "10px 20px",
               backgroundColor: "#6c757d",
               color: "white",
               border: "none",
               borderRadius: "6px",
               cursor: "pointer",
               fontSize: "14px"
             })
             .on("click", function() {
               overlay.remove();
             });

           const exportButton = $("<button>")
             .text("Export Selected")
             .css({
               padding: "10px 20px",
               backgroundColor: "#007bff",
               color: "white",
               border: "none",
               borderRadius: "6px",
               cursor: "pointer",
               fontSize: "14px",
               fontWeight: "bold"
             })
             .on("click", function() {
               overlay.remove();
               generateDetailedCsv(data, selectedPeriods, selectedCourses, selectedSort);
             });

           buttonContainer.append(cancelButton, exportButton);

           // Assemble popup
           popup.append(header, periodSection, courseSection, sortSection, buttonContainer);
           overlay.append(popup);

           // Add to page
           $("body").append(overlay);

           // Close on overlay click
           overlay.on("click", function(e) {
             if (e.target === overlay[0]) {
               overlay.remove();
             }
           });
         }

         // Function to update course selection when periods change
         function updateCourseSelection(data, selectedPeriods, courseContainer, selectedCourses) {
           // Get all unique courses from newly selected periods
           const allCourses = new Set();
           selectedPeriods.forEach(period => {
             if (data[period]) {
               Object.keys(data[period]).forEach(course => allCourses.add(course));
             }
           });

           // Update selectedCourses to only include available courses
           const newSelectedCourses = new Set();
           selectedCourses.forEach(course => {
             if (allCourses.has(course)) {
               newSelectedCourses.add(course);
             }
           });
           selectedCourses.clear();
           newSelectedCourses.forEach(course => selectedCourses.add(course));

           // Rebuild course buttons
           courseContainer.empty();
           Array.from(allCourses).sort().forEach(courseName => {
             const isSelected = selectedCourses.has(courseName);
             const courseButton = $("<button>")
               .text(courseName)
               .css({
                 padding: "6px 12px",
                 border: `2px solid ${isSelected ? "#28a745" : "#ddd"}`,
                 backgroundColor: isSelected ? "#28a745" : "white",
                 color: isSelected ? "white" : "black",
                 borderRadius: "6px",
                 cursor: "pointer",
                 fontSize: "14px",
                 transition: "all 0.2s ease"
               })
               .on("click", function() {
                 if (selectedCourses.has(courseName)) {
                   selectedCourses.delete(courseName);
                   $(this).css({
                     backgroundColor: "white",
                     color: "black",
                     borderColor: "#ddd"
                   });
                 } else {
                   selectedCourses.add(courseName);
                   $(this).css({
                     backgroundColor: "#28a745",
                     color: "white",
                     borderColor: "#28a745"
                   });
                 }
               });

             courseContainer.append(courseButton);
           });
         }

         // Function to update popup with loaded data
         function updateExportSelectionPopup(data, latestPeriod) {
           // Remove loading popup and show real popup
           $("#export-selection-overlay").remove();
           showExportSelectionPopup(data, latestPeriod, false);
         }

         // Function to generate the detailed CSV with selected data and sorting
         function generateDetailedCsv(data, selectedPeriods, selectedCourses, sortBy = "date") {
           console.log("[BetterResults] Generating detailed CSV with selections:", {
             periods: Array.from(selectedPeriods),
             courses: Array.from(selectedCourses),
             sortBy: sortBy
           });

           // Create detailed CSV data
           const csvData = [];
           csvData.push([
             "Period",
             "Course",
             "Test Date",
             "Test Name",
             "Score",
             "Percentage",
             "Color Code"
           ]);

           // Collect all evaluation data
           const allEvaluations = [];

           selectedPeriods.forEach(periodName => {
             if (!data[periodName]) return;

             selectedCourses.forEach(courseName => {
               if (!data[periodName][courseName]) return;

               data[periodName][courseName].forEach((evaluation) => {
                 const { description: desc = "/", color } = evaluation.graphic;
                 const match = desc.match(/([\d,.]+)\/([\d,.]+)/);
                 let percentage = "";
                 if (match) {
                   const num = parseFloat(match[1].replace(',', '.'));
                   const den = parseFloat(match[2].replace(',', '.'));
                   percentage = den > 0 ? (Math.round(num / den * 1000) / 10).toFixed(1) + "%" : "";
                 }

                 // Format date to remove time part
                 const dateOnly = evaluation.date.split('T')[0];

                 allEvaluations.push({
                   period: periodName,
                   course: courseName,
                   date: dateOnly,
                   name: evaluation.name,
                   score: desc,
                   percentage: percentage,
                   color: color,
                   // For sorting
                   dateObj: new Date(evaluation.date),
                   periodOrder: periodName,
                   courseOrder: courseName
                 });
               });
             });
           });

           // Sort evaluations based on selected method
           switch (sortBy) {
             case "date":
               // Sort by date (chronological)
               allEvaluations.sort((a, b) => a.dateObj - b.dateObj);
               break;
             case "period_subject":
               // Sort by period, then by subject
               allEvaluations.sort((a, b) => {
                 if (a.periodOrder !== b.periodOrder) {
                   return a.periodOrder.localeCompare(b.periodOrder);
                 }
                 return a.courseOrder.localeCompare(b.courseOrder);
               });
               break;
             case "subject_date":
               // Sort by subject, then by date/period
               allEvaluations.sort((a, b) => {
                 if (a.courseOrder !== b.courseOrder) {
                   return a.courseOrder.localeCompare(b.courseOrder);
                 }
                 return a.dateObj - b.dateObj;
               });
               break;
             default:
               // Default to date sorting
               allEvaluations.sort((a, b) => a.dateObj - b.dateObj);
           }

           // Convert to CSV rows
           allEvaluations.forEach(evaluation => {
             csvData.push([
               evaluation.period,
               evaluation.course,
               evaluation.date,
               evaluation.name,
               evaluation.score,
               evaluation.percentage,
               evaluation.color
             ]);
           });

           console.log("[BetterResults] Created detailed CSV with", csvData.length, "rows, sorted by:", sortBy);

           if (csvData.length <= 1) {
             alert("No data found for the selected courses and periods.");
             return;
           }

           // Convert to CSV string with consistent formatting
           const csvContent = csvData.map(row =>
             row.map(cell => {
               const cellStr = String(cell || '');
               // Ensure all cells are treated as text to avoid alignment issues
               return '"' + cellStr.replace(/"/g, '""') + '"';
             }).join(',')
           ).join('\n');

           // Create and download file
           const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
           const link = document.createElement('a');

           if (link.download !== undefined) {
             const url = URL.createObjectURL(blob);
             link.setAttribute('href', url);

             const now = new Date();
             const sortSuffix = sortBy === "date" ? "by_date" : sortBy === "period_subject" ? "by_period_subject" : "by_subject_date";
             const filename = `smartschool_detailed_results_${sortSuffix}_${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}.csv`;

             link.setAttribute('download', filename);
             link.style.visibility = 'hidden';
             document.body.appendChild(link);
             link.click();
             document.body.removeChild(link);

             console.log("[BetterResults] Detailed CSV export completed successfully");
           } else {
             console.error("[BetterResults] Download not supported");
             alert("Your browser doesn't support file downloads.");
           }
         }



         window.exportToCsv = function() {
           const gridData = window.extractGridData();
           if (!gridData) return;

           const { headers, data } = gridData;

           // Combine headers and data
           const csvData = [headers, ...data];

           // Convert to CSV string
           const csvContent = csvData.map(row =>
             row.map(cell => {
               // Escape quotes and wrap in quotes if contains comma, quote, or newline
               const cellStr = String(cell || '');
               if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                 return '"' + cellStr.replace(/"/g, '""') + '"';
               }
               return cellStr;
             }).join(',')
           ).join('\n');

           // Create and download file
           const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
           const link = document.createElement('a');

           if (link.download !== undefined) {
             const url = URL.createObjectURL(blob);
             link.setAttribute('href', url);

             // Generate filename with current date
             const now = new Date();
             const filename = `smartschool_results_${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}.csv`;

             link.setAttribute('download', filename);
             link.style.visibility = 'hidden';
             document.body.appendChild(link);
             link.click();
             document.body.removeChild(link);
           }
          };

          window.exportToExcel = function() {
            const gridData = window.extractGridData();
            if (!gridData) return;

           const { headers, data } = gridData;

           // Create a new workbook
           const wb = XLSX.utils.book_new();

           // Prepare data for Excel with formulas
           const excelData = [];
           excelData.push(headers);

           // Process each data row
           data.forEach((row, rowIndex) => {
             const excelRow = [];

             row.forEach((cell, colIndex) => {
               if (colIndex === 0) {
                 // Course name column
                 excelRow.push(cell);
               } else if (colIndex === row.length - 1) {
                 // Total column - create formula
                 const startCol = XLSX.utils.encode_col(1);
                 const endCol = XLSX.utils.encode_col(row.length - 2);
                 const rowNum = rowIndex + 2; // +2 because Excel is 1-indexed and we have header row

                 // Create formula to calculate percentage from scores
                 let formula = "";
                 let hasValidScores = false;

                 // Check if we have score data to calculate from
                 for (let i = 1; i < row.length - 1; i++) {
                   const score = row[i];
                   if (score && score.includes('/')) {
                     hasValidScores = true;
                     break;
                   }
                 }

                 if (hasValidScores) {
                   // Create formula to sum numerators and denominators
                   let numeratorSum = "";
                   let denominatorSum = "";

                   for (let i = 1; i < row.length - 1; i++) {
                     const col = XLSX.utils.encode_col(i);
                     const cellRef = col + rowNum;

                     // Extract numerator and denominator from score format like "8/10"
                     numeratorSum += `IFERROR(LEFT(${cellRef}, FIND("/", ${cellRef}) - 1) * 1, 0) + `;
                     denominatorSum += `IFERROR(MID(${cellRef}, FIND("/", ${cellRef}) + 1, LEN(${cellRef})) * 1, 0) + `;
                   }

                   // Remove trailing " + "
                   numeratorSum = numeratorSum.slice(0, -3);
                   denominatorSum = denominatorSum.slice(0, -3);

                   // Create percentage formula
                   formula = `IF(${denominatorSum} > 0, ROUND((${numeratorSum}) / (${denominatorSum}) * 1000) / 10, "")`;
                 } else {
                   // Just use the existing total if no scores to calculate from
                   formula = cell;
                 }

                 excelRow.push({ t: 's', f: formula });
               } else {
                 // Regular data cell - check if it's a score format
                 if (cell && cell.includes('/')) {
                   // Keep as string for display
                   excelRow.push(cell);
                 } else {
                   // Regular cell
                   excelRow.push(cell);
                 }
               }
             });

             excelData.push(excelRow);
           });

           // Create worksheet
           const ws = XLSX.utils.aoa_to_sheet(excelData);

           // Set column widths
           const colWidths = headers.map(header => ({ wch: Math.max(header.length, 15) }));
           ws['!cols'] = colWidths;

           // Add worksheet to workbook
           XLSX.utils.book_append_sheet(wb, ws, "Grid Results");

           // Generate filename with current date
           const now = new Date();
           const filename = `smartschool_results_${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}.xlsx`;

           // Save file
           XLSX.writeFile(wb, filename);
          };

         // Create export button in bottom right corner (like graph settings button)
         const exportButton = $("<button>")
           .attr("id", "grid-export-button")
           .html("📊") // Export icon
           .css({
             position: "fixed",
             bottom: "20px",
             right: "20px",
             width: "44px",
             height: "44px",
             borderRadius: "8px",
             border: "1px solid #e0e0e0",
             backgroundColor: "white",
             color: "#666",
             cursor: "pointer",
             fontSize: "18px",
             zIndex: 1000,
             display: "flex",
             alignItems: "center",
             justifyContent: "center",
             boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
             transition: "all 0.2s ease",
             fontFamily: "Arial, sans-serif"
           })
           .hover(
             function() {
               $(this).css({
                 backgroundColor: "#f8f9fa",
                 color: "#333",
                 boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                 transform: "scale(1.05)"
               });
             },
             function() {
               $(this).css({
                 backgroundColor: "white",
                 color: "#666",
                 boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                 transform: "scale(1)"
               });
             }
           )
           .on("click", function(e) {
             e.stopPropagation();
             // Show export options menu
             showExportMenu($(this));
           })
           .attr("title", "Export Grid Data")
           .attr("aria-label", "Export grid data");

         // Create export menu (hidden by default)
         const exportMenu = $("<div>")
           .attr("id", "grid-export-menu")
           .css({
             position: "absolute",
             bottom: "60px",
             right: "0",
             backgroundColor: "white",
             borderRadius: "8px",
             boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
             padding: "8px",
             display: "none",
             zIndex: 1001,
             minWidth: "150px"
           });

         const csvOption = $("<button>")
           .text("📄 Export Grid (Simple)")
           .css({
             display: "block",
             width: "100%",
             padding: "8px 12px",
             border: "none",
             backgroundColor: "transparent",
             color: "#333",
             cursor: "pointer",
             textAlign: "left",
             borderRadius: "4px",
             fontSize: "14px",
             transition: "background-color 0.2s ease"
           })
           .hover(
             function() {
               $(this).css("backgroundColor", "#f8f9fa");
             },
             function() {
               $(this).css("backgroundColor", "transparent");
             }
           )
           .on("click", function() {
             exportMenu.hide();
             window.exportToCsv();
           });

         const detailedCsvOption = $("<button>")
           .text("📋 Export Detailed (with test info)")
           .css({
             display: "block",
             width: "100%",
             padding: "8px 12px",
             border: "none",
             backgroundColor: "transparent",
             color: "#333",
             cursor: "pointer",
             textAlign: "left",
             borderRadius: "4px",
             fontSize: "14px",
             transition: "background-color 0.2s ease"
           })
           .hover(
             function() {
               $(this).css("backgroundColor", "#f8f9fa");
             },
             function() {
               $(this).css("backgroundColor", "transparent");
             }
           )
           .on("click", function() {
             exportMenu.hide();
             window.exportToCsvDetailed();
           });

         exportMenu.append(csvOption, detailedCsvOption);
         exportButton.append(exportMenu);

         // Function to show export menu
         function showExportMenu(button) {
           const menu = button.find("#grid-export-menu");
           menu.toggle();

           // Hide menu when clicking outside
           if (menu.is(":visible")) {
             $(document).on("click.exportMenu", function(e) {
               if (!$(e.target).closest("#grid-export-button").length) {
                 menu.hide();
                 $(document).off("click.exportMenu");
               }
             });
           }
         }



         modal.append(periodButtons, mainGrid, exportButton);
      
        // Apply button handler for year selection
        applyYearBtn.on("click", function() {
          const selectedYear = parseInt(yearSelect.val());
          if (!selectedYear) {
            alert("Please select a year");
            return;
          }

          // Update status text
          statusText.text(`Loading data for ${selectedYear}-${selectedYear + 1}...`);

          // Disable button during loading
          applyYearBtn.prop("disabled", true).html(`
            <img src="https://static2.smart-school.net/smsc/svg/spinner/spinner_64x64.svg" style="width: 16px; height: 16px; margin-right: 5px; vertical-align: middle;" alt="Loading...">
            Loading...
          `);

          // Fetch data for selected year
          fetchEvaluationsForYear(selectedYear)
            .then(newResults => {
              if (newResults.length === 0) {
                statusText.text(`No grades found for ${selectedYear}-${selectedYear + 1}`);
                $('#period-container-grid').empty().append($("<p>").text("No results found for the selected year"));
                return;
              }

              // Update status with count
              const gradeCount = newResults.filter(r => r.type === "normal").length;
              statusText.text(`Loaded ${gradeCount} grades for ${selectedYear}-${selectedYear + 1}`);

              // Process new results
              const newData = {};
              const newCourseIcons = {};
              let newLatestPeriod = null;
              const newAllResults = [];

              newResults.forEach((res) => {
                if (res.type !== "normal") return;

                newAllResults.push(res);

                const period = res.period.name;
                newLatestPeriod ??= period;
                newData[period] ??= {};

                res.courses.forEach((course) => {
                  const name = course.name;
                  newData[period][name] ??= [];
                  newData[period][name].push({
                    date: res.date,
                    name: res.name,
                    graphic: res.graphic,
                  });
                  newCourseIcons[name] = course.graphic;
                });
              });

              // Build new grids
              const newPeriodGrids = buildPeriodGrids(newData, newCourseIcons);

              // Update the global variables
              data = newData;
              courseIcons = newCourseIcons;
              latestPeriod = newLatestPeriod;
              allResults = newAllResults;

              // Update period buttons
              updatePeriodButtons(newPeriodGrids);

              // Select latest period by default
              if (newLatestPeriod && newPeriodGrids[newLatestPeriod]) {
                selectedPeriods.clear();
                selectedPeriods.add(newLatestPeriod);
                syncButtonStates();
                loadCombinedGrid();
              }
            })
            .catch(error => {
              console.error("[BetterResults] Error fetching year data:", error);
              statusText.text(`Error loading data for ${selectedYear}-${selectedYear + 1}`);
              alert("Error loading data: " + error.message);
            })
            .finally(() => {
              // Re-enable button
              applyYearBtn.prop("disabled", false).text("Apply");
            });
        });

       loading.replaceWith(modal);

     });

   return loading;
}

function LoadGrid() {
  console.log('[BetterResults] Loading grid CSS and fonts...');
  addGoogleFont();
  loadCSS("static/css/better-results-grid.css", "better-results-grid-css");
  console.log('[BetterResults] Grid CSS and fonts loaded');
  // Grid content is now loaded directly into the custom content area
  // No modal creation needed
}

function LoadGraph() {
  console.log('[BetterResults] Loading graph CSS and fonts...');
  addGoogleFont();
  loadCSS("static/css/better-results-graph.css", "better-results-graph-css");
  console.log('[BetterResults] Graph CSS and fonts loaded');
  // Graph content is now loaded directly into the custom content area
  // No modal creation needed
}



// MARK: Graph rendering
/**
 * Utility – turn “8/15” → {num:8, den:15, pct:53.3}
 */
function parseScore(desc) {
  const m = /^\s*([\d,.]+)\s*\/\s*([\d,.]+)/.exec(desc || "");
  if (!m) return null;
  const num = parseFloat(m[1].replace(",", "."));
  const den = parseFloat(m[2].replace(",", "."));
  return den ? { num, den, pct: (num / den) * 100 } : null;
}

/**
 * Decide colour for a segment given the Y value it **ends** at
 * Updated color coding as requested:
 * - Red: below 50%
 * - Yellow: 50% to 64%
 * - Light green: 65% to 84%
 * - Dark green: 85% to 100%
 */
function colourFor(y) {
  if (y < 50) return "#ff0000"; // red
  if (y < 65) return "#ffd531"; // yellow
  if (y < 85) return "#3bd63d"; // light green
  return "#2b8114"; // dark green
}

/**
 * Build or re-build a Chart.js line chart inside a <canvas>
 * – container : DOM element that will receive the canvas
 * – scores    : array of {pct:number} (already chronological)
 * – testData  : array of {name, date, graphic} for enhanced tooltips
 * – config    : {yAxis: 'cumulative'|'actual', xAxis: 'number'|'date'}
 */
// Simple chart rendering function - no longer needed since we use inline Chart creation

/* -------------------------------------------------------------------------- */
/*  Replace the ORIGINAL loadSubject() inside MakeGraph()                    */
/* -------------------------------------------------------------------------- */

function MakeGraph() {
   const loading = $("<div>").css({
     textAlign: "center",
     padding: "20px"
   }).html(`
     <img src="https://static2.smart-school.net/smsc/svg/spinner/spinner_64x64.svg" style="width: 48px; height: 48px;" alt="Loading...">
     <h3 style="margin-top: 10px;">Loading…</h3>
   `);

   // Year selector container for graph
   const yearSelectorContainerGraph = $("<div>")
     .attr("id", "year-selector-container-graph")
     .css({
       display: "flex",
       alignItems: "center",
       gap: "10px",
       marginBottom: "10px"
     });

   // Year selector dropdown for graph
   const yearSelectGraph = $("<select>")
     .attr("id", "year-selector-graph")
     .css({
       padding: "5px 10px",
       borderRadius: "4px",
       border: "1px solid #ddd"
     });

   // Apply button for graph
   const applyYearBtnGraph = $("<button>")
     .attr("id", "apply-year-btn-graph")
     .text("Apply")
     .addClass("period_button-graph")
     .css({
       padding: "5px 15px",
       backgroundColor: "#007bff",
       color: "white",
       border: "none",
       borderRadius: "4px",
       cursor: "pointer"
     });

   // Status text for graph
   const statusTextGraph = $("<span>")
     .attr("id", "year-selector-status-graph")
     .text("Loading years...")
     .css({
       fontSize: "12px",
       color: "#666",
       marginLeft: "10px"
     });

   yearSelectorContainerGraph.append(
     $("<span>").text("Select Year: "),
     yearSelectGraph,
     applyYearBtnGraph,
     statusTextGraph
   );

    // Function to fetch evaluations for a specific year
    function fetchEvaluationsForYear(startYear) {
      const startDate = `${startYear}-09-01`;
      const endDate = `${startYear + 1}-08-31`;
      const url = `/results/api/v1/evaluations?pageNumber=1&itemsOnPage=500&startDate=${startDate}&endDate=${endDate}`;

      console.log(`[BetterResults] Fetching evaluations for year ${startYear}: ${url}`);
      return fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .catch(error => {
          console.error(`[BetterResults] Fetch error for year ${startYear}:`, error);
          throw error;
        });
    }

   // Function to find available school years
   function findAvailableYears() {
     const currentDate = new Date();
     const currentYear = currentDate.getFullYear();
     const currentMonth = currentDate.getMonth() + 1; // getMonth() returns 0-11

     // Determine current school year
     // School year starts in September, so if we're before September, we're in the previous year
     const currentSchoolYear = currentMonth < 9 ? currentYear - 1 : currentYear;

     console.log(`[BetterResults] Current school year: ${currentSchoolYear}`);

     const years = [];
     let yearToCheck = currentSchoolYear;

     // Try current year first
     return fetchEvaluationsForYear(yearToCheck)
       .then(results => {
         const gradeCount = results.filter(r => r.type === "normal").length;
         if (gradeCount > 0) {
           years.push({ year: yearToCheck, count: gradeCount });
         }

         // Continue checking previous years until we find one with no grades
         function checkNextYear() {
           yearToCheck--;
           return fetchEvaluationsForYear(yearToCheck)
             .then(results => {
               const gradeCount = results.filter(r => r.type === "normal").length;
               if (gradeCount > 0) {
                 years.push({ year: yearToCheck, count: gradeCount });
                 return checkNextYear(); // Continue checking
               } else {
                 // No more grades found, stop here
                 return years;
               }
             });
         }

         return checkNextYear();
       })
       .then(() => {
         // Sort years descending (newest first)
         return years.sort((a, b) => b.year - a.year);
       });
   }

     // Get current school year
     const currentDate = new Date();
     const currentMonth = currentDate.getMonth() + 1;
     let currentSchoolYear = currentMonth < 9 ? currentDate.getFullYear() - 1 : currentDate.getFullYear();
     let displayYearGraph = currentSchoolYear; // Track which year we're actually displaying for graph

     console.log(`[BetterResults] Current school year: ${currentSchoolYear}`);

     // Function to load year data with fallback logic for graph
     function loadYearWithFallbackGraph(yearToLoad) {
       statusTextGraph.text(`Loading year (${yearToLoad}-${yearToLoad + 1})...`);

       return fetchEvaluationsForYear(yearToLoad)
         .then((results) => {
           console.log(`[BetterResults] Loaded year ${yearToLoad} data: ${results.length} results`);
           const gradeCount = results.filter(r => r.type === "normal").length;

           // If this is the current year and no grades found, try previous year
           if (yearToLoad === currentSchoolYear && gradeCount === 0) {
             console.log(`[BetterResults] No grades found for current year ${currentSchoolYear}, trying previous year for graph`);
             const previousYear = currentSchoolYear - 1;
             displayYearGraph = previousYear; // Update display year to previous year

             return loadYearWithFallbackGraph(previousYear);
           }

           return { results, year: yearToLoad, gradeCount };
         });
     }

     // Load data with fallback logic for graph
     loadYearWithFallbackGraph(currentSchoolYear)
       .then(({ results, year, gradeCount }) => {
         // Add the displayed year to selector
         yearSelectGraph.empty();
         const yearOption = $("<option>")
           .attr("value", year)
           .text(`${year}-${year + 1} (${gradeCount} grades)`);
         yearSelectGraph.append(yearOption);
         yearSelectGraph.val(year);

        // Start loading other years in the background
        findAvailableYears()
          .then(availableYears => {
            console.log(`[BetterResults] Found ${availableYears.length} total years with grades:`, availableYears);

            // Update selector with all available years
            yearSelectGraph.empty();
            availableYears.forEach(yearData => {
              const option = $("<option>")
                .attr("value", yearData.year)
                .text(`${yearData.year}-${yearData.year + 1} (${yearData.count} grades)`);
              yearSelectGraph.append(option);
            });

             // Keep the displayed year selected (could be fallback year)
             yearSelectGraph.val(displayYearGraph);
             statusTextGraph.text(`Found ${availableYears.length} years with grades`);
           })
           .catch(error => {
             console.error("[BetterResults] Error loading additional years:", error);
             statusTextGraph.text(`Loaded year (${displayYearGraph}-${displayYearGraph + 1})`);
           });

         // Process and display the loaded year data immediately
         return { results, year, gradeCount };
       })
       .then(({ results, year, gradeCount }) => {
       let data = {};
       let latestPeriod = null;

       // Parse Smartschool JSON
       results.forEach((res) => {
        if (res.type !== "normal") return;
        const period = res.period.name;
        latestPeriod ??= period;
        data[period] ??= {};
        res.courses.forEach((course) => {
          const name = course.name;
          data[period][name] ??= [];
          data[period][name].push({
            date: res.date,
            name: res.name,
            graphic: res.graphic,
          });
        });
      });

      // Create modal with period and subject selection
      const modal = $("<div>").attr("id", "content-container-graph");

      // Period selection buttons
      const periodLabel = $("<div>").text("Select Periods:").css("font-weight", "bold");
      const periodButtons = $("<div>").attr("id", "period-buttons-graph").css({
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
        marginBottom: "1rem"
      });

       const selectedPeriods = new Set();
       let isProcessingClickGraph = false; // Prevent rapid clicking for graph

       // Function to synchronize graph button CSS with backend state
       function syncGraphButtonStates() {
         $('.period-button-graph').each(function() {
           const $btn = $(this);
           const period = $btn.data('period');
           const isSelected = selectedPeriods.has(period);

           if (isSelected) {
             $btn.css({
               backgroundColor: "#007bff",
               borderColor: "#007bff",
               color: "white"
             }).addClass('period-button-initial-selected');
           } else {
             $btn.css({
               backgroundColor: "white",
               borderColor: "#ddd",
               color: "black"
             }).removeClass('period-button-initial-selected');
           }
         });
       }

       Object.keys(data).reverse().forEach(periodName => {
         const button = $("<button>")
           .addClass("period-button-graph")
           .text(periodName)
           .attr("data-period", periodName)
           .data("period", periodName)
           .css({
             padding: "0.5rem 1rem",
             border: "2px solid #ddd",
             borderRadius: "4px",
             backgroundColor: "white",
             cursor: "pointer",
             transition: "all 0.2s ease"
           })
           .hover(
             function() {
               // Only apply hover effect if button is not currently selected
               if ($(this).css('backgroundColor') !== 'rgb(0, 123, 255)' &&
                   !$(this).hasClass('period-button-initial-selected')) {
                 $(this).css({
                   backgroundColor: "#e7f3ff",
                   borderColor: "#007bff",
                   color: "#004085"
                 });
               }
             },
             function() {
               // Only apply default styling if button is not currently selected
               if ($(this).css('backgroundColor') !== 'rgb(0, 123, 255)' &&
                   !$(this).hasClass('period-button-initial-selected')) {
                 $(this).css({
                   backgroundColor: "white",
                   borderColor: "#ddd",
                   color: "black"
                 });
               }
             }
           )
            .on("click", function() {
              const $btn = $(this);
              const period = $btn.data("period");

              // Prevent rapid clicking
              if (isProcessingClickGraph) {
                console.log(`[BetterResults] Ignoring rapid click for graph period: ${period}`);
                return;
              }

              isProcessingClickGraph = true;
              console.log(`[BetterResults] Graph button clicked for period: ${period}`);

              // Add visual feedback - reduce opacity and change cursor
              $btn.css({
                opacity: 0.7,
                cursor: 'not-allowed',
                pointerEvents: 'none'
              });

              // Remove initial-selected class from all buttons when user interacts
              $('.period-button-graph').removeClass('period-button-initial-selected');

              // Update backend state
              if (selectedPeriods.has(period)) {
               selectedPeriods.delete(period);
             } else {
               selectedPeriods.add(period);
             }

             // Sync CSS with backend state
             syncGraphButtonStates();

             // Update subjects and chart with small delay to prevent race conditions
             setTimeout(() => {
               updateSubjectsAndChart();
               isProcessingClickGraph = false;
               // Restore visual feedback
               $btn.css({
                 opacity: 1,
                 cursor: 'pointer',
                 pointerEvents: 'auto'
               });
             }, 50);
           });

        periodButtons.append(button);
      });

      // Subject selection buttons
      const subjectLabel = $("<div>").text("Select Subject:").css("font-weight", "bold");
      const subjectButtons = $("<div>").attr("id", "subject-buttons-graph").css({
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
        marginBottom: "1rem"
      });

      let selectedSubject = null;

      // Chart title
      const chartTitle = $("<h2>").attr("id", "chart-title").css({
        textAlign: "center",
        marginBottom: "1rem"
      });

       // Settings modal background
       const settingsModalBg = $("<div>").attr("id", "graph-settings-modal-bg").css({
         display: "none",
         position: "fixed",
         top: 0,
         left: 0,
         width: "100%",
         height: "100%",
         backgroundColor: "rgba(0,0,0,0.5)",
         zIndex: 10000,
         cursor: "pointer"
       });

       // Settings modal content
       const settingsModal = $("<div>").attr("id", "graph-settings-modal").css({
         position: "fixed",
         top: "50%",
         left: "50%",
         transform: "translate(-50%, -50%)",
         backgroundColor: "white",
         borderRadius: "8px",
         padding: "1.5rem",
         boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
         zIndex: 10001,
         minWidth: "300px",
         maxWidth: "90vw"
       });

        // Settings button - positioned in top right of graph view
        const settingsButton = $("<button>")
          .attr("id", "graph-settings-button")
          .html("&#9881;") // Unicode gear symbol
          .css({
            position: "fixed",
            bottom: "20px",
            right: "20px",
            width: "44px",
            height: "44px",
            borderRadius: "8px",
            border: "1px solid #e0e0e0",
            backgroundColor: "white",
            color: "#666",
            cursor: "pointer",
            fontSize: "18px",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            transition: "all 0.2s ease",
            fontFamily: "Arial, sans-serif"
          })
          .hover(
            function() {
              $(this).css({
                backgroundColor: "#f8f9fa",
                color: "#333",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                transform: "scale(1.05)"
              });
            },
            function() {
              $(this).css({
                backgroundColor: "white",
                color: "#666",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                transform: "scale(1)"
              });
            }
          )
          .on("click", function(e) {
            e.stopPropagation();
            settingsModalBg.show();
          })
          .attr("title", "Graph Settings")
          .attr("aria-label", "Open graph settings");

       // X-axis settings
       const xAxisLabel = $("<div>").text("X-Axis:").css("font-weight", "bold");
       const xAxisSelect = $("<select>").attr("id", "x-axis-select").css({
         marginLeft: "0.5rem",
         padding: "0.25rem",
         borderRadius: "4px"
       });
       xAxisSelect.append($("<option>").attr("value", "date").text("Date"));
       xAxisSelect.append($("<option>").attr("value", "number").text("Test Number"));

       // Y-axis settings
       const yAxisLabel = $("<div>").text("Y-Axis:").css("font-weight", "bold");
       const yAxisSelect = $("<select>").attr("id", "y-axis-select").css({
         marginLeft: "0.5rem",
         padding: "0.25rem",
         borderRadius: "4px"
       });
       yAxisSelect.append($("<option>").attr("value", "percentage").text("Percentage"));
       yAxisSelect.append($("<option>").attr("value", "cumulative").text("Cumulative Percentage"));

       // Settings controls container - compact horizontal layout
       const settingsControls = $("<div>").css({
         display: "flex",
         gap: "0.5rem",
         alignItems: "center",
         flexWrap: "wrap",
         justifyContent: "flex-start"
       });

       // Modal title
       const modalTitle = $("<h3>").text("Graph Settings").css({
         margin: "0 0 1rem 0",
         fontSize: "1.2rem",
         fontWeight: "600",
         color: "#333"
       });

       // Create compact label-select pairs
       const xAxisGroup = $("<div>").css({
         display: "flex",
         alignItems: "center",
         gap: "0.5rem",
         marginBottom: "1rem"
       });
       xAxisGroup.append(xAxisLabel, xAxisSelect);

       const yAxisGroup = $("<div>").css({
         display: "flex",
         alignItems: "center",
         gap: "0.5rem",
         marginBottom: "1rem"
       });
       yAxisGroup.append(yAxisLabel, yAxisSelect);

       // Close button
       const closeButton = $("<button>")
         .text("×")
         .css({
           position: "absolute",
           top: "15px",
           right: "15px",
           background: "none",
           border: "none",
           fontSize: "1.8rem",
           cursor: "pointer",
           color: "#666",
           padding: "0",
           width: "40px",
           height: "40px",
           display: "flex",
           alignItems: "center",
           justifyContent: "center",
           borderRadius: "50%",
           transition: "all 0.2s ease"
         })
         .hover(function() {
           $(this).css({
             backgroundColor: "#f0f0f0",
             color: "#333"
           });
         }, function() {
           $(this).css({
             backgroundColor: "transparent",
             color: "#666"
           });
         })
         .on("click", function() {
           settingsModalBg.hide();
         })
         .attr("title", "Close settings")
         .attr("aria-label", "Close settings modal");

       // Apply button
       const applyButton = $("<button>")
         .text("Apply")
         .css({
           padding: "0.5rem 1rem",
           backgroundColor: "#007bff",
           color: "white",
           border: "none",
           borderRadius: "4px",
           cursor: "pointer",
           fontSize: "0.9rem"
         })
         .on("click", function() {
           settingsModalBg.hide();
           if (selectedSubject) loadChart();
         });

       settingsModal.append(modalTitle, closeButton, xAxisGroup, yAxisGroup, applyButton);
       settingsModalBg.append(settingsModal);

       // Close modal when clicking background
       settingsModalBg.on("click", function() {
         settingsModalBg.hide();
       });

       // Prevent modal content clicks from closing modal
       settingsModal.on("click", function(e) {
         e.stopPropagation();
       });

       // Load settings from localStorage
       const loadSettings = () => {
         const settings = JSON.parse(localStorage.getItem('graphSettings') || '{}');
         xAxisSelect.val(settings.xAxis || 'date');
         yAxisSelect.val(settings.yAxis || 'percentage');
       };

       // Save settings to localStorage
       const saveSettings = () => {
         const settings = {
           xAxis: xAxisSelect.val(),
           yAxis: yAxisSelect.val()
         };
         localStorage.setItem('graphSettings', JSON.stringify(settings));
       };

       // Load initial settings
       loadSettings();

       // Save settings when changed (but don't update chart until Apply is clicked)
       xAxisSelect.on('change', () => {
         saveSettings();
       });
       yAxisSelect.on('change', () => {
         saveSettings();
       });

       // Chart container
       const chartContainer = $("<div>").attr("id", "chart-container").css({
         width: "100%",
         height: "400px",
         marginTop: "1rem"
       });

      // Function to update subjects and chart
      function updateSubjectsAndChart() {
        // Clear existing subject buttons
        subjectButtons.empty();

        if (selectedPeriods.size === 0) {
          selectedSubject = null;
          chartContainer.html("<p>Please select at least one period</p>");
          chartTitle.text("");
          return;
        }

        // Combine subjects from all selected periods
        const allSubjects = new Set();
        selectedPeriods.forEach(period => {
          if (data[period]) {
            Object.keys(data[period]).forEach(subject => {
              allSubjects.add(subject);
            });
          }
        });

        // Check if current subject is still available
        const currentSubjectStillAvailable = selectedSubject && allSubjects.has(selectedSubject);

        // Create subject buttons
        Array.from(allSubjects).sort().forEach(subjectName => {
          const isSelected = subjectName === selectedSubject;
          const button = $("<button>")
            .addClass("subject-button-graph")
            .text(subjectName)
            .data("subject", subjectName)
             .attr('data-selected', isSelected ? 'true' : 'false')
             .css({
               padding: "0.5rem 1rem",
               border: "2px solid #ddd",
               borderRadius: "4px",
               backgroundColor: isSelected ? "#28a745" : "white",
               color: isSelected ? "white" : "black",
               cursor: "pointer",
               transition: "all 0.2s ease"
             })
             .hover(
               function() {
                 // Only apply hover effect if button is not selected
                 if ($(this).attr('data-selected') !== 'true') {
                   $(this).css({
                     backgroundColor: "#f8fff9",
                     borderColor: "#28a745",
                     color: "#2d5a3d"
                   });
                 }
               },
               function() {
                 // Only apply default styling if button is not selected
                 if ($(this).attr('data-selected') !== 'true') {
                   $(this).css({
                     backgroundColor: "white",
                     borderColor: "#ddd",
                     color: "black"
                   });
                 }
               }
             )
            .on("click", function() {
              const $btn = $(this);
              const subject = $btn.data("subject");

               // Remove selection from other buttons
               $('.subject-button-graph').each(function() {
                 $(this).attr('data-selected', 'false').css({
                   backgroundColor: "white",
                   borderColor: "#ddd",
                   color: "black"
                 });
               });

               // Select this button with good green color
               $btn.attr('data-selected', 'true').css({
                 backgroundColor: "#28a745",
                 borderColor: "#28a745",
                 color: "white"
               });

              selectedSubject = subject;
              loadChart();
            });

          subjectButtons.append(button);
        });

        // Handle subject selection consistency
        if (currentSubjectStillAvailable) {
          // Current subject is already visually selected during button creation
          loadChart(); // Refresh the chart with current subject
         } else if (allSubjects.size > 0) {
           // Don't auto-select subject, show message to user
           selectedSubject = null;
           chartContainer.html("<p style='text-align: center; padding: 2rem; color: #666; font-style: italic;'>Please select a subject to start viewing the chart</p>");
           chartTitle.text("");
         } else {
          // No subjects available
          selectedSubject = null;
          chartContainer.html("<p>No subjects available for selected periods</p>");
          chartTitle.text("");
        }
      }

       // Function to load chart for selected periods and subject
       function loadChart() {
         if (selectedPeriods.size === 0 || !selectedSubject) return;

         // Update title
         const periodNames = Array.from(selectedPeriods).join(", ");
         chartTitle.text(`${periodNames}: ${selectedSubject}`);

         // Combine data from all selected periods for this subject
         let allTests = [];
         selectedPeriods.forEach(period => {
           if (data[period] && data[period][selectedSubject]) {
             allTests = allTests.concat(data[period][selectedSubject]);
           }
         });

         allTests.sort((a, b) => a.date.localeCompare(b.date));
         const parsed = allTests.map((t) => parseScore(t.graphic.description)).filter(Boolean);

         if (parsed.length === 0) {
           chartContainer.html("<p>No numeric grades found for this subject</p>");
           return;
         }

         // Get current settings
         const xAxisType = xAxisSelect.val();
         const yAxisType = yAxisSelect.val();

         // Clear previous chart
         chartContainer.empty();
         const canvas = $("<canvas>").appendTo(chartContainer)[0];
         const ctx = canvas.getContext("2d");

         // Prepare data based on settings
         let labels, chartData, yAxisTitle, xAxisTitle;

         // X-axis configuration
         if (xAxisType === 'date') {
           // Format dates for display as category labels
           labels = allTests.map(test => {
             try {
               const date = new Date(test.date);
               // Check if date is valid
               if (isNaN(date.getTime())) {
                 return `Test ${allTests.indexOf(test) + 1}`;
               }
               return date.toLocaleDateString('en-GB', {
                 day: '2-digit',
                 month: '2-digit',
                 year: 'numeric'
               });
             } catch (error) {
               console.warn('Error parsing date:', test.date, error);
               return `Test ${allTests.indexOf(test) + 1}`;
             }
           });
           xAxisTitle = "Date";
         } else {
           // Test numbers
           labels = allTests.map((_, idx) => `Test ${idx + 1}`);
           xAxisTitle = "Test Number";
         }

         // Y-axis configuration
         if (yAxisType === 'cumulative') {
           // Calculate cumulative percentages
           let cumulativeNum = 0;
           let cumulativeDen = 0;
           chartData = parsed.map(score => {
             cumulativeNum += score.num;
             cumulativeDen += score.den;
             return cumulativeDen > 0 ? (cumulativeNum / cumulativeDen) * 100 : 0;
           });
           yAxisTitle = "Cumulative Percentage";
         } else {
           // Regular percentages
           chartData = parsed.map(s => s.pct);
           yAxisTitle = "Percentage";
         }

        // Create period mapping for tooltips
        const testPeriodMap = allTests.map(test => {
          // Find which period this test belongs to
          for (const [periodName, periodData] of Object.entries(data)) {
            if (periodData[selectedSubject] && periodData[selectedSubject].some(t => t.date === test.date && t.name === test.name)) {
              return periodName;
            }
          }
          return 'Unknown Period';
        });

        // Color function based on percentage
        function getColorForPercentage(pct) {
          if (pct < 50) return "#ff0000"; // red
          if (pct < 65) return "#ffd531"; // yellow
          if (pct < 85) return "#3bd63d"; // light green
          return "#2b8114"; // dark green
        }

          // Debug logging
          console.log('Creating chart with:', {
            xAxisType,
            yAxisType,
            labels: labels.slice(0, 5), // First 5 labels for debugging
            chartData: chartData.slice(0, 5), // First 5 data points for debugging
            xAxisTitle,
            yAxisTitle
          });

          new Chart(ctx, {
            type: "line",
            data: {
              labels,
              datasets: [{
                data: chartData,
                borderColor: "#3bd63d",
                backgroundColor: "#3bd63d",
                fill: false,
                tension: 0.1,
                pointBackgroundColor: chartData.map(getColorForPercentage),
                pointBorderColor: chartData.map(getColorForPercentage),
                segment: {
                  borderColor: (ctx) => getColorForPercentage(ctx.p1.parsed.y)
                }
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              
              scales: {
                y: {
                  min: 0,
                  max: 100,
                  title: { display: true, text: yAxisTitle }
                },
                x: {
                  type: 'category',
                  title: { display: true, text: xAxisTitle }
                }
              },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: (ctx) => {
                  const dataIndex = ctx.tooltip.dataPoints[0].dataIndex;
                  const percentage = chartData[dataIndex];

                  // Get color based on percentage
                  let gradeColor;
                  if (percentage < 50) gradeColor = "#ff0000"; // red
                  else if (percentage < 65) gradeColor = "#ffd531"; // yellow
                  else if (percentage < 85) gradeColor = "#3bd63d"; // light green
                  else gradeColor = "#2b8114"; // dark green

                  // Add more transparency for subtle effect
                  return gradeColor + '80'; // 50% opacity - much more subtle
                },
                titleColor: '#000000',
                bodyColor: '#000000',
                borderColor: 'rgba(0,0,0,0.2)',
                borderWidth: 1,
                cornerRadius: 8,
                displayColors: false, // Remove any colored squares/indicators
                callbacks: {
                  title: (ctx) => {
                    const dataIndex = ctx[0].dataIndex;
                    return allTests[dataIndex]?.name || `Test ${dataIndex + 1}`;
                  },
                  label: (ctx) => {
                    const dataIndex = ctx.dataIndex;
                    const period = testPeriodMap[dataIndex];
                    const grade = `${parsed[dataIndex].num}/${parsed[dataIndex].den}`;
                    const percentage = ctx.parsed.y.toFixed(1);
                    return `${grade} (${percentage}%) - ${period}`;
                  }
                }
              }
            }
          }
        });
      }

        // Initialize with latest period selected
        if (latestPeriod) {
          selectedPeriods.add(latestPeriod);
          console.log(`[BetterResults] Selecting latest period for graph: ${latestPeriod}`);

          // Use setTimeout to ensure DOM is ready
          setTimeout(() => {
            // Sync all button states to ensure consistency
            syncGraphButtonStates();
            console.log(`[BetterResults] Applied initial selection styling to graph button ${latestPeriod}`);
          }, 100);

          updateSubjectsAndChart();
        }

         modal.append(yearSelectorContainerGraph, settingsButton, periodLabel, periodButtons, subjectLabel, subjectButtons, chartTitle, chartContainer);

        // Initialize with no subject selected and show message
        selectedSubject = null;
        chartContainer.html("<p style='text-align: center; padding: 2rem; color: #666; font-style: italic;'>Please select a subject to start viewing the chart</p>");
        chartTitle.text("");

        // Add modal to body
        $("body").append(settingsModalBg);

        // Apply button handler for year selection in graph
        applyYearBtnGraph.on("click", function() {
          const selectedYear = parseInt(yearSelectGraph.val());
          if (!selectedYear) {
            alert("Please select a year");
            return;
          }

          // Update status text
          statusTextGraph.text(`Loading data for ${selectedYear}-${selectedYear + 1}...`);

          // Disable button during loading
          applyYearBtnGraph.prop("disabled", true).html(`
            <img src="https://static2.smart-school.net/smsc/svg/spinner/spinner_64x64.svg" style="width: 16px; height: 16px; margin-right: 5px; vertical-align: middle;" alt="Loading...">
            Loading...
          `);

          // Fetch data for selected year
          fetchEvaluationsForYear(selectedYear)
            .then(newResults => {
              if (newResults.length === 0) {
                statusTextGraph.text(`No grades found for ${selectedYear}-${selectedYear + 1}`);
                chartContainer.html("<p>No results found for the selected year</p>");
                chartTitle.text("");
                subjectButtons.empty();
                return;
              }

              // Update status with count
              const gradeCount = newResults.filter(r => r.type === "normal").length;
              statusTextGraph.text(`Loaded ${gradeCount} grades for ${selectedYear}-${selectedYear + 1}`);

              // Process new results
              const newData = {};
              let newLatestPeriod = null;

              newResults.forEach((res) => {
                if (res.type !== "normal") return;

                const period = res.period.name;
                newLatestPeriod ??= period;
                newData[period] ??= {};
                res.courses.forEach((course) => {
                  const name = course.name;
                  newData[period][name] ??= [];
                  newData[period][name].push({
                    date: res.date,
                    name: res.name,
                    graphic: res.graphic,
                  });
                });
              });

              // Update the global variables
              data = newData;
              latestPeriod = newLatestPeriod;

              // Clear selections
              selectedPeriods.clear();
              selectedSubject = null;

              // Update period buttons
              periodButtons.empty();
              Object.keys(data).reverse().forEach(periodName => {
                const button = $("<button>")
                  .addClass("period-button-graph")
                  .text(periodName)
                  .attr("data-period", periodName)
                  .data("period", periodName)
                  .css({
                    padding: "0.5rem 1rem",
                    border: "2px solid #ddd",
                    borderRadius: "4px",
                    backgroundColor: "white",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  })
                  .hover(
                    function() {
                      // Only apply hover effect if button is not currently selected
                      if ($(this).css('backgroundColor') !== 'rgb(0, 123, 255)' &&
                          !$(this).hasClass('period-button-initial-selected')) {
                        $(this).css({
                          backgroundColor: "#e7f3ff",
                          borderColor: "#007bff",
                          color: "#004085"
                        });
                      }
                    },
                    function() {
                      // Only apply default styling if button is not currently selected
                      if ($(this).css('backgroundColor') !== 'rgb(0, 123, 255)' &&
                          !$(this).hasClass('period-button-initial-selected')) {
                        $(this).css({
                          backgroundColor: "white",
                          borderColor: "#ddd",
                          color: "black"
                        });
                      }
                    }
                  )
                  .on("click", function() {
                    const $btn = $(this);
                    const period = $btn.data("period");

                    // Prevent rapid clicking
                    if (isProcessingClickGraph) {
                      console.log(`[BetterResults] Ignoring rapid click for graph period: ${period}`);
                      return;
                    }

                    isProcessingClickGraph = true;
                    console.log(`[BetterResults] Graph button clicked for period: ${period}`);

                    // Add visual feedback - reduce opacity and change cursor
                    $btn.css({
                      opacity: 0.7,
                      cursor: 'not-allowed',
                      pointerEvents: 'none'
                    });

                    // Remove initial-selected class from all buttons when user interacts
                    $('.period-button-graph').removeClass('period-button-initial-selected');

                    // Update backend state
                    if (selectedPeriods.has(period)) {
                     selectedPeriods.delete(period);
                    } else {
                     selectedPeriods.add(period);
                    }

                    // Sync CSS with backend state
                    syncGraphButtonStates();

                    // Update subjects and chart with small delay to prevent race conditions
                    setTimeout(() => {
                      updateSubjectsAndChart();
                      isProcessingClickGraph = false;
                      // Restore visual feedback
                      $btn.css({
                        opacity: 1,
                        cursor: 'pointer',
                        pointerEvents: 'auto'
                      });
                    }, 50);
                  });

                periodButtons.append(button);
              });

              // Select latest period by default
              if (newLatestPeriod && data[newLatestPeriod]) {
                selectedPeriods.add(newLatestPeriod);
                syncGraphButtonStates();
                updateSubjectsAndChart();
              }
            })
            .catch(error => {
              console.error("[BetterResults] Error fetching year data:", error);
              statusTextGraph.text(`Error loading data for ${selectedYear}-${selectedYear + 1}`);
              alert("Error loading data: " + error.message);
            })
            .finally(() => {
              // Re-enable button
              applyYearBtnGraph.prop("disabled", false).text("Apply");
            });
        });

       loading.replaceWith(modal);

    })
    .catch((error) => {
      console.error("Error loading graph:", error);
      loading.text("Error loading graph: " + error.message);
    });

  return loading;
}

function LoadGrid() {
  console.log('[BetterResults] Loading grid CSS and fonts...');
  addGoogleFont();
  loadCSS("static/css/better-results-grid.css", "better-results-grid-css");
  console.log('[BetterResults] Grid CSS and fonts loaded');
  // Grid content is now loaded directly into the custom content area
  // No modal creation needed
}

function LoadGraph() {
  addGoogleFont();
  loadCSS("static/css/better-results-graph.css", "better-results-graph-css");
  // Graph content is now loaded directly into the custom content area
  // No modal creation needed
}