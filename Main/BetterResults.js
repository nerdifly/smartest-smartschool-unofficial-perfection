/* gridGraphExtension.js
 *
 * Injects two buttons (Grid & Graph) into Smartschool's wide toolbar. Each
 * button opens a modal window with either a tabular overview (Grid) or a more
 * interactive chart‑style view (Graph) of the student results.
 *
 * ‑ All major blocks are documented below; comments are concise on purpose.
 * ‑ Duplicate code has been factored out where possible (e.g. font/style
 *   injection helpers) to remove some of the original "rotsooi".
 *
 */

"use strict";

/* -------------------------------------------------------------------------- */
/* 1. Mutation observers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * When Smartschool re‑renders the toolbar, our custom buttons disappear.  We
 * watch for those removals and immediately re‑append the buttons so they stay
 * visible.
 */
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

/**
 * We cannot observe <.wide-toolbar> until it exists.  Therefore we start with
 * #smscMain; as soon as the toolbar is added we: disconnect, start the toolbar
 * observer, inject our buttons, and preload the modal content.
 */
new MutationObserver((mutations, obs) => {
  for (const { type, addedNodes } of mutations) {
    if (
      type === "childList" &&
      addedNodes.length === 1 &&
      addedNodes[0].classList.contains("wide-toolbar")
    ) {
      obs.disconnect();

      console.log('[BetterResults] Toolbar detected, initializing extension...');

      // 1️⃣ Start watching the toolbar itself
      wideToolbarObserver.observe($(".wide-toolbar")[0], {
        childList: true,
        subtree: false,
      });

      // 2️⃣ Create content area for custom tabs
      createCustomContentArea();

      // 3️⃣ Prepare our UI assets
      LoadGrid();
      LoadGraph();
      addButtons();

      // 4️⃣ Set up URL change detection
      setupURLChangeDetection();

      console.log('[BetterResults] Extension initialized successfully');

      // Send message to background script
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

/* -------------------------------------------------------------------------- */
/* 2. Helper utilities                                                        */
/* -------------------------------------------------------------------------- */

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

/** Inject a <style> tag if it hasn’t been added yet */
function injectStyles(css, idSuffix) {
  const id = `custom-style-${idSuffix}`;
  console.log(`[BetterResults] Injecting CSS for ${idSuffix}, ID: ${id}`);

  if (!document.getElementById(id)) {
    console.log(`[BetterResults] Creating new style element for ${idSuffix}`);
    const styleElement = $("<style>", { id, html: css }).appendTo("head");
    console.log(`[BetterResults] Style element created and appended for ${idSuffix}`, styleElement);
  } else {
    console.log(`[BetterResults] Style element ${id} already exists, skipping injection`);
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Wide‑toolbar button injection                                           */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* 4. GRID view                                                               */
/* -------------------------------------------------------------------------- */

function MakeGrid() {
  const loading = $("<h3>").text("Loading…");
  
  const filterToggleBtn = $("<button>")
    .attr("id", "filter-toggle-btn")
    .text("🔍 Show Date Filter")
    .addClass("period_button-grid");
  
  const filterContainer = $("<div>")
    .attr("id", "filter-container-grid")
    
  const dateInput = $("<input>").attr({
    type: "date", 
    id: "date-filter-input"
  });
  
  const filterTypeSelect = $("<select>").attr("id", "filter-type-select");
  filterTypeSelect.append($("<option>").attr("value", "before").text("Before"));
  filterTypeSelect.append($("<option>").attr("value", "after").text("After"));
  
  const applyFilterBtn = $("<button>")
    .attr("id", "apply-filter-btn")
    .text("Apply Filter")
    .addClass("period_button-grid");
  
  const clearFilterBtn = $("<button>")
    .attr("id", "clear-filter-btn")
    .text("Clear Filter")
    .addClass("period_button-grid");
  
  filterContainer.append(
    $("<span>").text("Filter results: "),
    filterTypeSelect,
    dateInput,
    applyFilterBtn,
    clearFilterBtn
  );

  fetch("/results/api/v1/evaluations?itemsOnPage=500")
    .then((r) => r.json())
    .then((results) => {
      /* Structure: { [period]: { [course]: result[] } } */
      const data = {};
      const courseIcons = {};
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
             row.append(
               $("<th>").addClass("course-name-cell").append(
                 icon && icon.type === "icon"
                   ? $("<span>")
                       .addClass(`icon-label icon-label--24 smsc-svg--${icon.value}--24`)
                       .text(courseName)
                   : courseName
               )
             );

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
      
      modal.append(filterContainer);

        // Move selectedPeriods to outer scope so it can be accessed by createCombinedGrid
        let selectedPeriods = new Set();

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
                 console.log(`[BetterResults] Button clicked for period: ${period}`);

                 // Remove initial-selected class from all buttons when user interacts
                 $('.period-button-grid').removeClass('period-button-initial-selected');

                 if (selectedPeriods.has(period)) {
                   selectedPeriods.delete(period);
                   $btn.css({
                     backgroundColor: "white",
                     borderColor: "#ddd",
                     color: "black"
                   });
                 } else {
                   selectedPeriods.add(period);
                   $btn.css({
                     backgroundColor: "#007bff",
                     borderColor: "#007bff",
                     color: "white"
                   });
                 }
                 loadCombinedGrid();
               });

            periodButtonsContainer.append(button);
          });

          periodButtons.append(periodLabel, periodButtonsContainer);

          function loadCombinedGrid() {
            mainGrid.empty();

            // Create combined table with original grid design
            const combinedTable = createCombinedGrid();
            mainGrid.append(combinedTable);
          }

         // Initialize with latest period selected
         if (latestPeriod && grids[latestPeriod]) {
           selectedPeriods.add(latestPeriod);
           console.log(`[BetterResults] Selecting latest period: ${latestPeriod}`);

           // Use setTimeout to ensure DOM is ready
           setTimeout(() => {
             const $button = $(`.period-button-grid[data-period="${latestPeriod}"]`);
             console.log(`[BetterResults] Found button for ${latestPeriod}:`, $button.length);

             if ($button.length > 0) {
               $button
                 .addClass("period-button-initial-selected")
                 .css({
                   backgroundColor: "#007bff",
                   borderColor: "#007bff",
                   color: "white"
                 });
               console.log(`[BetterResults] Applied initial selection styling to ${latestPeriod}`);
               console.log(`[BetterResults] Button classes:`, $button.attr('class'));
               console.log(`[BetterResults] Button styles:`, $button.attr('style'));
             } else {
               console.warn(`[BetterResults] Could not find button for period: ${latestPeriod}`);
               // Try alternative selectors
               console.log(`[BetterResults] All period buttons:`, $('.period-button-grid').length);
               $('.period-button-grid').each(function() {
                 console.log(`[BetterResults] Button text: "${$(this).text()}", data-period: "${$(this).attr('data-period')}"`);
               });
             }

             // Additional fallback: try to find by text content
             if ($button.length === 0) {
               $('.period-button-grid').each(function() {
                 if ($(this).text().trim() === latestPeriod) {
                   console.log(`[BetterResults] Found button by text match: ${latestPeriod}`);
                   $(this)
                     .addClass("period-button-initial-selected")
                     .css({
                       backgroundColor: "#007bff",
                       borderColor: "#007bff",
                       color: "white"
                     });
                   return false; // break out of each loop
                 }
               });
             }
           }, 100);

           loadCombinedGrid();
         }
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
            headerRow.append($("<th>").text("Eval " + i).css({
              textAlign: "center",
              backgroundColor: "#f8f9fa",
              fontWeight: "bold",
              minWidth: "100px"
            }));
          }

          // Add total column
          headerRow.append($("<th>").text("Total").css({
            position: "sticky",
            right: 0,
            backgroundColor: "#f8f9fa",
            zIndex: 10,
            fontWeight: "bold",
            minWidth: "80px",
            textAlign: "center"
          }));

          table.append(headerRow);

          // Create data rows for each course - just like original grid
          Array.from(allCourses).sort().forEach(courseName => {
            const row = $("<tr>").addClass("course-row");

            // Course name cell
            row.append($("<th>").text(courseName).css({
              position: "sticky",
              left: 0,
              backgroundColor: "white",
              zIndex: 5,
              textAlign: "left",
              fontWeight: "normal"
            }));

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
        modal.append(periodButtons, mainGrid);
      
       applyFilterBtn.on("click", function() {
         const filterDate = dateInput.val();
         if (!filterDate) {
           alert("Please select a date for filtering");
           return;
         }

         const filterType = filterTypeSelect.val();

         const filteredResults = allResults.filter(res => {
           if (filterType === "before") {
             return res.date <= filterDate;
           } else {
             return res.date >= filterDate;
           }
         });

         if (filteredResults.length === 0) {
           alert("No results found with the selected filter");
           return;
         }

         const newPeriodGrids = buildGridWithFilter(filteredResults);

         updatePeriodButtons(newPeriodGrids);

          // After filtering, select the latest available period by default
          const availablePeriods = Object.keys(newPeriodGrids);
          if (availablePeriods.length > 0) {
            const latestPeriod = availablePeriods[availablePeriods.length - 1];
            // Clear all selections and classes first
            $('.period-button-grid').removeClass('period-button-initial-selected').css({
              backgroundColor: "white",
              borderColor: "#ddd",
              color: "black"
            });
            // Select the latest period with initial-selected styling
            $(`.period-button-grid[data-period="${latestPeriod}"]`)
              .addClass('period-button-initial-selected')
              .css({
                backgroundColor: "#007bff",
                borderColor: "#007bff",
                color: "white"
              });
            // Update selectedPeriods set
            selectedPeriods.clear();
            selectedPeriods.add(latestPeriod);
            loadCombinedGrid();
          } else {
            $('#period-container-grid').empty().append($("<p>").text("No results match your filter criteria"));
          }
       });
      
        clearFilterBtn.on("click", function() {
          dateInput.val("");

          updatePeriodButtons(periodGrids);

          // Restore the latest period selection after clearing filter
          if (latestPeriod && periodGrids[latestPeriod]) {
            // Clear all selections and classes first
            $('.period-button-grid').removeClass('period-button-initial-selected').css({
              backgroundColor: "white",
              borderColor: "#ddd",
              color: "black"
            });
            // Select the latest period with initial-selected styling
            $(`.period-button-grid[data-period="${latestPeriod}"]`)
              .addClass('period-button-initial-selected')
              .css({
                backgroundColor: "#007bff",
                borderColor: "#007bff",
                color: "white"
              });
            // Update selectedPeriods set
            selectedPeriods.clear();
            selectedPeriods.add(latestPeriod);
            loadCombinedGrid();
          }
        });

       loading.replaceWith(modal);

     });

   return loading;
}

function LoadGrid() {
  console.log('[BetterResults] Loading grid CSS and fonts...');
  addGoogleFont();
  injectStyles(GRID_CSS, "grid");
  console.log('[BetterResults] Grid CSS and fonts loaded');
  // Grid content is now loaded directly into the custom content area
  // No modal creation needed
}

function LoadGraph() {
  console.log('[BetterResults] Loading graph CSS and fonts...');
  addGoogleFont();
  injectStyles(GRAPH_CSS, "graph");
  console.log('[BetterResults] Graph CSS and fonts loaded');
  // Graph content is now loaded directly into the custom content area
  // No modal creation needed
}



const GRID_CSS = `#result-table-grid #disclamer-grid {
  border: none !important;
  color: red;
  font-weight: bold;
  position: relative;
}

#disclamer-grid:hover::before {
  visibility: visible;
  opacity: 1;
}

#disclamer-grid::before {
  z-index: 1;
  content: "Deze totalen kunnen afwijken van uw werkelijke resultaten doordat niet altijd alle gegevens gekend zijn.";
  position: absolute;
  left: -20rem;
  border: 3px solid red;
  padding: 0.2rem;
  border-radius: 3px;
  background-color: white;
  width: 20rem;
  visibility: hidden;
  opacity: 0;
  transition: visibility 0s, opacity 0.5s linear;
}

#details-grid {
  position: relative;
}

#result-table-grid .hidden-cell-grid {
  border: none !important;
}

.period_button-grid {
  background-color: #007bff;
  border: 2px solid #ddd;
  border-radius: 4px;
  color: #FFFFFF;
  margin-right: 0.5rem;
  padding: 0.5rem 1rem;
  text-align: center;
  transition: all 0.2s ease;
  cursor: pointer;
}

.period_button-grid:hover {
  background-color: #0056b3;
  border-color: #0056b3;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.period_button-grid:active {
  background-color: #004085;
  transform: translateY(0);
}

.total-grid {
  font-weight: bold;
}

.is-low-grid {
  color: red !important;
}

#table-container-grid {
  flex: 1 1 auto;
  overflow: auto;
}

#period-grid {
  height: 100%;
  display: flex;
  flex-direction: column;
}

#period-container-grid {
  flex: 1;
  min-height: 0;
}

#content-container-grid {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

#result-table-grid {
  margin-top: 1rem;
  border: 0px;
}

#result-table-grid th {
  text-align: left;
}

#result-table-grid td {
  text-align: center;
}

#result-table-grid th,
#result-table-grid td {
  border: 1px solid #dee2e6 !important;
  padding: 0.5rem;
  min-width: 5.5rem;
}

#modal-background-grid {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0,0,0,0.5);
  z-index: 1000;
}

#modal-content-grid {
  background-color: white;
  border-radius: 10px;
  box-shadow: 0 0 20px 0 #222;
  display: none;
  padding: 20px;
  position: fixed;
  z-index: 1000;
  left: 10%;
  top: 10%;
  width: 80%;
  height: 80%;
}

#modal-background-grid.active,
#modal-content-grid.active {
  display: block;
}

#modal-close-grid {
  font-family: 'Poppins', sans-serif;
  color: rgb(100, 100, 100);
  padding: 0.6rem;
  text-align: center;
  transition: all 200ms ease;
  position: absolute;
  right: 0.5rem;
  top: 0.5rem;
  background: #ffffff;
  border: 2px solid #e9ecef;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 1.4rem;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

#modal-close-grid:hover {
  background-color: #f8f9fa;
  border-color: #dc3545;
  color: #dc3545;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

#modal-close-grid:active {
  background-color: #f5f5f5;
  border-color: #bd2130;
  color: #bd2130;
  transform: scale(0.95);
}

/* --- PERIOD SELECTION FOR GRID --- */
#period-selection-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

#period-checkboxes-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.period-checkbox-wrapper-grid {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
}

.period-checkbox-grid {
  margin: 0;
}

#period-controls-grid {
  display: flex;
  gap: 0.5rem;
}

.period-control-button-grid {
  background-color: #28a745;
  border: 2px solid #28a745;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.period-control-button-grid:hover {
  background-color: #218838;
  border-color: #218838;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.period-control-button-grid:active {
  transform: translateY(0);
}

#reset-periods-grid {
  background-color: #dc3545;
  border-color: #dc3545;
}

#reset-periods-grid:hover {
  background-color: #c82333;
  border-color: #c82333;
}

/* Original grid design - combined into one table */
#combined-table-container {
  overflow-x: auto;
  overflow-y: visible;
  position: relative;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  max-width: 100%;
}

#combined-result-table {
  border-collapse: collapse;
  width: 100%;
  min-width: 800px;
  font-size: 0.9rem;
}

#combined-result-table th,
#combined-result-table td {
  border: 1px solid #dee2e6;
  padding: 0.5rem;
  text-align: center;
}

#combined-result-table th {
  background-color: #f8f9fa;
  font-weight: bold;
}

.course-row {
  border-bottom: 1px solid #dee2e6;
  transition: background-color 0.2s ease;
}

.course-row:hover {
  background-color: #f8f9fa;
}

.course-row:nth-child(even) {
  background-color: #fafbfc;
}

/* Sticky columns - just like original grid */
#combined-result-table th:first-child,
#combined-result-table td:first-child {
  position: sticky;
  left: 0;
  background-color: white;
  z-index: 10;
  text-align: left;
  font-weight: normal;
}

#combined-result-table th:last-child,
#combined-result-table td:last-child {
  position: sticky;
  right: 0;
  background-color: white;
  z-index: 10;
  font-weight: bold;
}

/* Original grid evaluation cell styling */
#combined-result-table td[id="details-grid"] {
  cursor: pointer;
  padding: 4px 8px;
  position: relative;
}

/* JavaScript tooltip styles — inline JS creates the tooltip element (.
grid-tooltip). Remove the old ::before/::after arrows and instead style
the floating element so it matches the graph tooltip (rounded, green,
subtle shadow). The JS still sets the exact background/text colours. */
.grid-tooltip {
  position: absolute !important;
  z-index: 10000 !important;
  pointer-events: none !important;
  padding: 8px 10px;
  border-radius: 8px;
  color: #000 !important;
  font-family: 'Poppins', sans-serif;
  font-size: 12px;
  /* Use CSS variable --bg so the pseudo-element arrow can match the
     dynamically-set background color. Fallback to a translucent light
     green if the variable isn't set. */
  background-color: var(--bg, rgba(59,214,61,0.9));
  box-shadow: 0 6px 18px rgba(0,0,0,0.12);
  white-space: pre-line;
  text-align: left;
  line-height: 1.2;
}

/* Arrow that points to the cell. We position it on the left or right
   depending on where the tooltip is placed. The arrow color uses the
   same background via the --bg CSS variable. */
.grid-tooltip::after {
  content: '';
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  pointer-events: none;
}

.grid-tooltip.arrow-right::after {
  left: -8px;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-right: 8px solid var(--bg, rgba(59,214,61,0.9));
}

.grid-tooltip.arrow-left::after {
  right: -8px;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-left: 8px solid var(--bg, rgba(59,214,61,0.9));
}

/* Total column styling */
.total-grid {
  font-weight: bold;
}

/* Overall total row */
.overall-total-row {
  background-color: #e3f2fd !important;
  border-top: 3px solid #2196f3 !important;
  border-bottom: 2px solid #2196f3 !important;
}

.overall-total-row th {
  background-color: #e3f2fd !important;
  font-weight: bold !important;
  font-size: 1.1em !important;
  color: #1976d2 !important;
}

.overall-total-row td:last-child {
  background-color: #fff !important;
  border: 2px solid #2196f3 !important;
  font-size: 1.2em !important;
  color: #1976d2 !important;
}

/* Period buttons styling */
.period-button-grid {
  transition: all 0.2s ease;
}

.period-button-grid:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.period-button-grid:active {
  transform: translateY(0);
}

/* Initially selected (latest) period styling - same as manual selection */
.period-button-grid.period-button-initial-selected,
.period-button-graph.period-button-initial-selected {
  background-color: #007bff !important;
  border-color: #007bff !important;
  color: white !important;
  position: relative;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
}

/* Responsive design */
@media (max-width: 768px) {
  #filter-container-grid {
    flex-direction: column;
    align-items: flex-start;
  }

  #period-buttons-grid {
    flex-direction: column;
  }

  .period-button-grid {
    width: 100%;
    margin-bottom: 0.25rem;
  }

  #combined-result-table {
    font-size: 0.8rem;
  }

  #combined-result-table th,
  #combined-result-table td {
    padding: 0.25rem;
  }
}

/* Filter container styling */
#filter-container-grid {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #dee2e6;
}

#date-filter-input {
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9rem;
}

#filter-type-select {
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9rem;
  background-color: white;
}

#apply-filter-btn, #clear-filter-btn {
  padding: 0.5rem 1rem;
  background-color: #28a745;
  color: white;
  border: 2px solid #28a745;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

#clear-filter-btn {
  background-color: #dc3545;
  border-color: #dc3545;
}

#apply-filter-btn:hover {
  background-color: #218838;
  border-color: #218838;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

#clear-filter-btn:hover {
  background-color: #c82333;
  border-color: #c82333;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

#apply-filter-btn:active, #clear-filter-btn:active {
  transform: translateY(0);
}

/* Custom content area for integrated tabs */
#custom-content-area {
  background-color: white;
  border-radius: 10px;
  padding: 20px;
  width: 100%;
  height: calc(100vh - 200px);
  overflow: auto;
}

/* Period buttons container for grid */
#period-buttons-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

/* Table container for grid */
#table-container-grid {
  overflow-x: auto;
  overflow-y: visible;
  max-width: 100%;
}

/* Result table for grid */
#result-table-grid {
  border-collapse: collapse;
  width: 100%;
  min-width: 600px;
  font-size: 0.9rem;
}

/* Course evaluation cells */
.c-1-combo--300, .c-2-combo--300, .c-3-combo--300, .c-4-combo--300 {
  padding: 4px 8px;
  border-radius: 4px;
  text-align: center;
  font-weight: 500;
}

/* Color classes for evaluations */
.c-1-combo--300 { background-color: #ff0000; color: white; } /* Red */
.c-2-combo--300 { background-color: #ffd531; color: black; } /* Yellow */
.c-3-combo--300 { background-color: #3bd63d; color: white; } /* Light Green */
.c-4-combo--300 { background-color: #2b8114; color: white; } /* Dark Green */

/* Course name cells */
.course-name-cell {
  font-weight: bold;
  text-align: left;
  padding: 8px;
}

/* Total cells */
.total-grid {
  font-weight: bold;
  background-color: #f8f9fa;
}

/* Low score styling */
.is-low-grid {
  color: red !important;
  font-weight: bold;
}

/* Evaluation cells */
.evaluation-cell {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.evaluation-cell:hover {
  background-color: rgba(0,0,0,0.1);
}

/* Multi-evaluation cells */
.multi-evaluation {
  border-left: 2px solid #007bff;
}

/* Empty cells */
.empty-cell {
  background-color: #f8f9fa;
}

/* Overall total row */
.overall-total-row {
  background-color: #e3f2fd;
  border-top: 2px solid #2196f3;
}

.overall-total-row th {
  background-color: #e3f2fd;
  font-weight: bold;
  color: #1976d2;
}

.overall-total-value {
  background-color: #fff;
  border: 2px solid #2196f3;
  font-size: 1.1em;
  color: #1976d2;
}
`

 function openGrid() {
   $("#modal-content-grid, #modal-background-grid").toggleClass("active");
 }

 // Debug function to test period selection
 function testPeriodSelection() {
   console.log('[BetterResults] Testing period selection...');
   console.log(`[BetterResults] All period buttons:`, $('.period-button-grid').length);
   $('.period-button-grid').each(function() {
     const $btn = $(this);
     const period = $btn.data('period') || $btn.attr('data-period');
     const text = $btn.text().trim();
     console.log(`[BetterResults] Button: text="${text}", data-period="${period}", classes="${$btn.attr('class')}"`);
   });

   // Try to select the first period button
   const $firstButton = $('.period-button-grid').first();
   if ($firstButton.length > 0) {
     console.log('[BetterResults] Testing selection on first button');
     $firstButton.css({
       backgroundColor: "#007bff",
       borderColor: "#007bff",
       color: "white"
     });
   }
 }


/* -------------------------------------------------------------------------- */
/*  🟢  GRAPH  – real Chart.js rendering                                    */
/* -------------------------------------------------------------------------- */

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
  const loading = $("<h3>").text("Loading…");

  fetch("/results/api/v1/evaluations?itemsOnPage=500")
    .then((r) => r.json())
    .then((results) => {
      const data = {};
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
             console.log(`[BetterResults] Graph button clicked for period: ${period}`);

             // Remove initial-selected class from all buttons when user interacts
             $('.period-button-graph').removeClass('period-button-initial-selected');

             if (selectedPeriods.has(period)) {
              selectedPeriods.delete(period);
              $btn.css({
                backgroundColor: "white",
                borderColor: "#ddd",
                color: "black"
              });
            } else {
              selectedPeriods.add(period);
              $btn.css({
                backgroundColor: "#007bff",
                borderColor: "#007bff",
                color: "white"
              });
            }
            updateSubjectsAndChart();
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
           const $button = $(`.period-button-graph[data-period="${latestPeriod}"]`);
           console.log(`[BetterResults] Found graph button for ${latestPeriod}:`, $button.length);

           if ($button.length > 0) {
             $button
               .addClass("period-button-initial-selected")
               .css({
                 backgroundColor: "#007bff",
                 borderColor: "#007bff",
                 color: "white"
               });
             console.log(`[BetterResults] Applied initial selection styling to graph button ${latestPeriod}`);
           } else {
             console.warn(`[BetterResults] Could not find graph button for period: ${latestPeriod}`);
             // Try alternative selectors
             console.log(`[BetterResults] All graph period buttons:`, $('.period-button-graph').length);
             $('.period-button-graph').each(function() {
               console.log(`[BetterResults] Graph button text: "${$(this).text()}", data-period: "${$(this).attr('data-period')}"`);
             });

             // Fallback: try to find by text content
             if ($button.length === 0) {
               $('.period-button-graph').each(function() {
                 if ($(this).text().trim() === latestPeriod) {
                   console.log(`[BetterResults] Found graph button by text match: ${latestPeriod}`);
                   $(this)
                     .addClass("period-button-initial-selected")
                     .css({
                       backgroundColor: "#007bff",
                       borderColor: "#007bff",
                       color: "white"
                     });
                   return false; // break out of each loop
                 }
               });
             }
           }
         }, 100);

         updateSubjectsAndChart();
       }

        modal.append(settingsButton, periodLabel, periodButtons, subjectLabel, subjectButtons, chartTitle, chartContainer);

        // Initialize with no subject selected and show message
        selectedSubject = null;
        chartContainer.html("<p style='text-align: center; padding: 2rem; color: #666; font-style: italic;'>Please select a subject to start viewing the chart</p>");
        chartTitle.text("");

       // Add modal to body
       $("body").append(settingsModalBg);
      loading.replaceWith(modal);

    })
    .catch((error) => {
      console.error("Error loading graph:", error);
      loading.text("Error loading graph: " + error.message);
    });

  return loading;
}

function LoadGraph() {
  addGoogleFont();
  injectStyles(GRAPH_CSS, "graph");
  // Graph content is now loaded directly into the custom content area
  // No modal creation needed
}


/* -------------------------------------------------------------------------- */
/* 6. CSS (kept inline for simplicity)                                        */
/* -------------------------------------------------------------------------- */




const FILTER_CSS = `
#filter-container-grid {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #dee2e6;
}

#date-filter-input {
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9rem;
}

#filter-type-select {
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9rem;
  background-color: white;
}

#apply-filter-btn, #clear-filter-btn {
  padding: 0.5rem 1rem;
  background-color: #28a745;
  color: white;
  border: 2px solid #28a745;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

#clear-filter-btn {
  background-color: #dc3545;
  border-color: #dc3545;
}

#apply-filter-btn:hover {
  background-color: #218838;
  border-color: #218838;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

#clear-filter-btn:hover {
  background-color: #c82333;
  border-color: #c82333;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

#apply-filter-btn:active, #clear-filter-btn:active {
  transform: translateY(0);
}

/* --- PERIOD SELECTION FOR GRID --- */
#period-selection-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

#period-checkboxes-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.period-checkbox-wrapper-grid {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
}

.period-checkbox-grid {
  margin: 0;
}

#period-controls-grid {
  display: flex;
  gap: 0.5rem;
}

.period-control-button-grid {
  background-color: #28a745;
  border: 2px solid #28a745;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.period-control-button-grid:hover {
  background-color: #218838;
  border-color: #218838;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.period-control-button-grid:active {
  transform: translateY(0);
}

#reset-periods-grid {
  background-color: #dc3545;
  border-color: #dc3545;
}

#reset-periods-grid:hover {
  background-color: #c82333;
  border-color: #c82333;
}

   /* Original grid design - combined into one table */
   #combined-table-container {
     overflow-x: auto;
     overflow-y: visible;
     position: relative;
     border: 1px solid #dee2e6;
     border-radius: 4px;
     max-width: 100%;
   }

   #combined-result-table {
     border-collapse: collapse;
     width: 100%;
     min-width: 800px;
     font-size: 0.9rem;
   }

   #combined-result-table th,
   #combined-result-table td {
     border: 1px solid #dee2e6;
     padding: 0.5rem;
     text-align: center;
   }

   #combined-result-table th {
     background-color: #f8f9fa;
     font-weight: bold;
   }

   .course-row {
     border-bottom: 1px solid #dee2e6;
     transition: background-color 0.2s ease;
   }

   .course-row:hover {
     background-color: #f8f9fa;
   }

   .course-row:nth-child(even) {
     background-color: #fafbfc;
   }

   /* Sticky columns - just like original grid */
   #combined-result-table th:first-child,
   #combined-result-table td:first-child {
     position: sticky;
     left: 0;
     background-color: white;
     z-index: 10;
     text-align: left;
     font-weight: normal;
   }

   #combined-result-table th:last-child,
   #combined-result-table td:last-child {
     position: sticky;
     right: 0;
     background-color: white;
     z-index: 10;
     font-weight: bold;
   }

   /* Original grid evaluation cell styling */
   #combined-result-table td[id="details-grid"] {
     cursor: pointer;
     padding: 4px 8px;
     position: relative;
   }

  /* JavaScript tooltip styles — inline JS creates the tooltip element (.
    grid-tooltip). Remove the old ::before/::after arrows and instead style
    the floating element so it matches the graph tooltip (rounded, green,
    subtle shadow). The JS still sets the exact background/text colours. */
  .grid-tooltip {
    position: absolute !important;
    z-index: 10000 !important;
    pointer-events: none !important;
    padding: 8px 10px;
    border-radius: 8px;
    color: #000 !important;
  font-family: 'Poppins', sans-serif;
  font-size: 12px;
    /* Use CSS variable --bg so the pseudo-element arrow can match the
       dynamically-set background color. Fallback to a translucent light
       green if the variable isn't set. */
    background-color: var(--bg, rgba(59,214,61,0.9));
    box-shadow: 0 6px 18px rgba(0,0,0,0.12);
    white-space: pre-line;
    text-align: left;
    line-height: 1.2;
  }

  /* Arrow that points to the cell. We position it on the left or right
     depending on where the tooltip is placed. The arrow color uses the
     same background via the --bg CSS variable. */
  .grid-tooltip::after {
    content: '';
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .grid-tooltip.arrow-right::after {
    left: -8px;
    border-top: 8px solid transparent;
    border-bottom: 8px solid transparent;
    border-right: 8px solid var(--bg, rgba(59,214,61,0.9));
  }

  .grid-tooltip.arrow-left::after {
    right: -8px;
    border-top: 8px solid transparent;
    border-bottom: 8px solid transparent;
    border-left: 8px solid var(--bg, rgba(59,214,61,0.9));
  }

   /* Total column styling */
   .total-grid {
     font-weight: bold;
   }

   /* Overall total row */
   .overall-total-row {
     background-color: #e3f2fd !important;
     border-top: 3px solid #2196f3 !important;
     border-bottom: 2px solid #2196f3 !important;
   }

   .overall-total-row th {
     background-color: #e3f2fd !important;
     font-weight: bold !important;
     font-size: 1.1em !important;
     color: #1976d2 !important;
   }

   .overall-total-row td:last-child {
     background-color: #fff !important;
     border: 2px solid #2196f3 !important;
     font-size: 1.2em !important;
     color: #1976d2 !important;
   }

   /* Period buttons styling */
   .period-button-grid {
     transition: all 0.2s ease;
   }

   .period-button-grid:hover {
     transform: translateY(-1px);
     box-shadow: 0 2px 4px rgba(0,0,0,0.1);
   }

   .period-button-grid:active {
     transform: translateY(0);
   }

   /* Responsive design */
   @media (max-width: 768px) {
     #filter-container-grid {
       flex-direction: column;
       align-items: flex-start;
     }

     #period-buttons-grid {
       flex-direction: column;
     }

     .period-button-grid {
       width: 100%;
       margin-bottom: 0.25rem;
     }

     #combined-result-table {
       font-size: 0.8rem;
     }

     #combined-result-table th,
     #combined-result-table td {
       padding: 0.25rem;
     }
    }
  `;

const GRAPH_CSS = `/* --- GENERAL --- */
#content-container-graph {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

/* Graph controls */
#period-buttons-graph, #subject-buttons-graph {
  margin: 0.5rem 0 1rem 0;
}

.period-button-graph, .subject-button-graph {
  transition: all 0.2s ease;
}

.period-button-graph:hover, .subject-button-graph:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

#chart-title {
  color: #333;
  font-size: 1.2rem;
  margin-bottom: 1rem;
}

/* Simple graph styling */

/* --- SUBJECT CONTAINER --- */
#subject-container-graph {
  margin-top: 0.5rem;
}

/* Simple graph styling */

/* --- INTEGRATED CONTENT --- */
#content-container-graph {
  height: 100%;
  width: 100%;
  overflow: auto;
}

 .selected-subject {
   background-color: #28a745 !important;
   border-color: #28a745 !important;
   color: white !important;
 }

  .selected-subject:hover {
    background-color: #218838 !important;
  }

   /* Settings button - modern floating design */
   #graph-settings-button {
     transition: all 0.2s ease;
     backdropFilter: "blur(10px)";
   }

   #graph-settings-button:hover {
     background-color: #f8f9fa !important;
     color: #333 !important;
     box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
     transform: scale(1.05) !important;
   }

   #graph-settings-button:active {
     transform: scale(0.95) !important;
   }

  /* Settings modal styles */
  #graph-settings-modal-bg {
    animation: fadeIn 0.2s ease;
  }

  #graph-settings-modal {
    animation: slideIn 0.2s ease;
  }

  #graph-settings-modal select {
    padding: 0.4rem 0.6rem;
    border: 1px solid #ced4da;
    border-radius: 4px;
    background-color: white;
    font-size: 0.9rem;
    minWidth: "120px";
  }

  #graph-settings-modal div {
    font-size: 0.9rem;
    font-weight: 500;
    color: "#333";
  }

  #graph-settings-modal button {
    transition: background-color 0.2s ease;
  }

  #graph-settings-modal button:hover {
    opacity: 0.9;
  }

  /* Animations */
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

   /* Responsive modal */
   @media (max-width: 768px) {
     #graph-settings-modal {
       minWidth: "280px";
       padding: "1.2rem";
       top: "45%";
     }

     #graph-settings-button {
       width: "40px !important";
       height: "40px !important";
       fontSize: "16px !important";
       bottom: "15px !important";
       right: "15px !important";
     }

     #graph-settings-modal select {
       font-size: 0.85rem;
       padding: 0.35rem 0.55rem;
     }

     #graph-settings-modal div {
       font-size: 0.85rem;
     }
   }

    #graph-settings-button {
      width: "44px";
      height: "44px";
      fontSize: "1.1rem";
      top: "65px";
      right: "12px";
    }

    #graph-settings-modal select {
      font-size: 0.85rem;
      padding: 0.35rem 0.55rem;
    }

    #graph-settings-modal div {
      font-size: 0.85rem;
    }
  }`;

/* -------------------------------------------------------------------------- */
/* End of file                                                                */
/* -------------------------------------------------------------------------- */
