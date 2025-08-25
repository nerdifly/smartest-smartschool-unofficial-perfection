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

      // 1️⃣ Start watching the toolbar itself
      wideToolbarObserver.observe($(".wide-toolbar")[0], {
        childList: true,
        subtree: false,
      });

      // 2️⃣ Prepare our UI assets
      LoadGrid();
      LoadGraph();
      addButtons();
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
  if (!document.getElementById(id)) {
    $("<style>", { id, html: css }).appendTo("head");
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Wide‑toolbar button injection                                           */
/* -------------------------------------------------------------------------- */

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
      .click(openGrid)
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
      .click(openGraph)
  );
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
            const row = $("<tr>");

            const icon = courseIcons[courseName];
            row.append(
              $("<th>").append(
                icon && icon.type === "icon"
                  ? $("<span>")
                      .addClass(`icon-label icon-label--24 smsc-svg--${icon.value}--24`)
                      .text(courseName)
                  : courseName
              )
            );

            let num = 0;
            let den = 0;
            results.forEach(({ name, graphic }) => {
              const { description: desc = "/", color } = graphic;
              row.append(
                $("<td>")
                  .addClass(`c-${color}-combo--300`)
                  .attr({ id: "details-grid", content: name })
                  .text(desc)
              );

              const m = /^([\d,.]+)\/([\d,.]+)$/.exec(desc);
              if (m) {
                num += parseFloat(m[1].replace(",", "."));
                den += parseFloat(m[2].replace(",", "."));
              }
            });

            for (let i = 0; i < maxLen - results.length; i++) row.append($("<td>"));

            const totalCell = $("<td>").addClass("total-grid");
            if (den) {
              totalCell.text(ratioToPercent(num, den));
              if (num / den < 0.5) totalCell.addClass("is-low-grid");
            }
            row.append(totalCell);

            overallNum += num;
            overallDen += den;
            table.append(row);
          });

          const overallRow = $("<tr>");
          overallRow.append($("<th>").text("Total"));
          for (let i = 0; i < maxLen; i++) overallRow.append($("<td>"));

          const overallCell = $("<td>").addClass("total-grid");
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

       function updatePeriodButtons(grids) {
         periodButtons.empty();

         const periodSelection = $("<div>").attr("id", "period-selection-grid");
         periodSelection.append(
           $("<span>").text("Select periods: ").css("font-weight", "bold")
         );

         const periodCheckboxes = $("<div>").attr("id", "period-checkboxes-grid");
         const selectedPeriods = new Set();

         // Select All button
         const selectAllBtn = $("<button>")
           .attr("id", "select-all-periods-grid")
           .text("Select All")
           .addClass("period-control-button-grid");

         // Reset button
         const resetBtn = $("<button>")
           .attr("id", "reset-periods-grid")
           .text("Reset")
           .addClass("period-control-button-grid");

         const periodControls = $("<div>").attr("id", "period-controls-grid");
         periodControls.append(selectAllBtn, resetBtn);

         Object.entries(grids)
           .reverse()
           .forEach(([periodName, grid]) => {
             const checkboxWrapper = $("<label>").addClass("period-checkbox-wrapper-grid");
             const checkbox = $("<input>")
               .attr({ type: "checkbox", value: periodName })
               .addClass("period-checkbox-grid");
             const label = $("<span>").text(periodName);

             checkboxWrapper.append(checkbox, label);
             periodCheckboxes.append(checkboxWrapper);
           });

         periodSelection.append(periodCheckboxes, periodControls);
         periodButtons.append(periodSelection);

         function loadMultipleGrids(selectedPeriodNames) {
           mainGrid.empty();

           if (selectedPeriodNames.length === 0) {
             mainGrid.append($("<p>").text("Please select at least one period."));
             return;
           }

           selectedPeriodNames.forEach(periodName => {
             if (grids[periodName]) {
               mainGrid.append(grids[periodName]);
             }
           });
         }

         function updateSelectedPeriods() {
           const checkedBoxes = $('.period-checkbox-grid:checked');
           const selectedPeriodNames = Array.from(checkedBoxes).map(cb => cb.value);
           selectedPeriods.clear();
           selectedPeriodNames.forEach(name => selectedPeriods.add(name));
           loadMultipleGrids(selectedPeriodNames);
         }

         // Event handlers
         $('.period-checkbox-grid').on('change', updateSelectedPeriods);

         selectAllBtn.on('click', function() {
           $('.period-checkbox-grid').prop('checked', true);
           updateSelectedPeriods();
         });

         resetBtn.on('click', function() {
           $('.period-checkbox-grid').prop('checked', false);
           mainGrid.empty();
           mainGrid.append($("<p>").text("Please select at least one period."));
         });

         // Initialize with latest period selected
         if (latestPeriod && grids[latestPeriod]) {
           $(`.period-checkbox-grid[value="${latestPeriod}"]`).prop('checked', true);
           updateSelectedPeriods();
         }
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
        
         const firstPeriod = Object.keys(newPeriodGrids)[0];
         if (firstPeriod) {
           $('#period-container-grid').empty().append(newPeriodGrids[firstPeriod]);
         } else {
           $('#period-container-grid').empty().append($("<p>").text("No results match your filter criteria"));
         }
      });
      
      clearFilterBtn.on("click", function() {
        dateInput.val("");
        
        updatePeriodButtons(periodGrids);
        
         if (latestPeriod && periodGrids[latestPeriod]) {
           $('#period-container-grid').empty().append(periodGrids[latestPeriod]);
         }
      });

       loading.replaceWith(modal);

     });

   return loading;
}

function LoadGrid() {
  addGoogleFont();
  injectStyles(GRID_CSS, "grid");
  injectStyles(FILTER_CSS, "filter"); 

  $("body")
    .append($("<div>").attr("id", "modal-background-grid"))
    .append(
      $("<div>")
        .attr("id", "modal-content-grid")
        .append($("<button>").attr("id", "modal-close-grid").text("X"))
        .append(MakeGrid())
    );

  $("#modal-background-grid, #modal-close-grid").on("click", () =>
    $("#modal-content-grid, #modal-background-grid").toggleClass("active")
  );
}

function openGrid() {
  $("#modal-content-grid, #modal-background-grid").toggleClass("active");
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
          .data("period", periodName)
          .css({
            padding: "0.5rem 1rem",
            border: "2px solid #ddd",
            borderRadius: "4px",
            backgroundColor: "white",
            cursor: "pointer"
          })
          .on("click", function() {
            const $btn = $(this);
            const period = $btn.data("period");

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

       // Settings button - positioned under the close button
       const settingsButton = $("<button>")
         .attr("id", "graph-settings-button")
         .text("⚙️")
         .css({
           padding: "0.6rem",
           backgroundColor: "#6c757d",
           color: "white",
           border: "none",
           borderRadius: "50%",
           cursor: "pointer",
           width: "48px",
           height: "48px",
           fontSize: "1.2rem",
           position: "absolute",
           top: "70px",
           right: "15px",
           zIndex: 10,
           display: "flex",
           alignItems: "center",
           justifyContent: "center",
           boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
         })
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
            .css({
              padding: "0.5rem 1rem",
              border: "2px solid #ddd",
              borderRadius: "4px",
              backgroundColor: isSelected ? "#28a745" : "white",
              borderColor: isSelected ? "#28a745" : "#ddd",
              color: isSelected ? "white" : "black",
              cursor: "pointer"
            })
            .on("click", function() {
              const $btn = $(this);
              const subject = $btn.data("subject");

              // Remove selection from other buttons
              $('.subject-button-graph').css({
                backgroundColor: "white",
                borderColor: "#ddd",
                color: "black"
              });

              // Select this button
              $btn.css({
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
          // Current subject not available, select first available subject
          const firstSubject = Array.from(allSubjects)[0];
          selectedSubject = firstSubject;
          loadChart();
        } else {
          // No subjects available
          selectedSubject = null;
          chartContainer.html("<p>No subjects available for selected periods</p>");
          chartTitle.text("");
        }
      }

       // Store previous chart data for animations
       let previousChartData = null;
       let previousLabels = null;
       let chartInstance = null;

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

          // Create animated chart
          const chart = new Chart(ctx, {
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
              animation: {
                duration: 1500,
                easing: 'easeInOutQuart',
                // Animate line drawing
                onProgress: function(animation) {
                  // Custom line drawing animation
                  const chart = animation.chart;
                  const ctx = chart.ctx;
                  const dataset = chart.data.datasets[0];
                  const meta = chart.getDatasetMeta(0);

                  if (meta.hidden) return;

                  ctx.save();
                  ctx.strokeStyle = dataset.borderColor;
                  ctx.lineWidth = dataset.borderWidth || 2;
                  ctx.lineCap = 'round';
                  ctx.lineJoin = 'round';

                  // Draw animated line
                  const points = meta.data;
                  if (points.length > 1) {
                    const progress = animation.currentStep / animation.numSteps;

                    ctx.beginPath();
                    ctx.moveTo(points[0].x, points[0].y);

                    for (let i = 1; i < points.length; i++) {
                      const point = points[i];
                      const prevPoint = points[i - 1];

                      // Interpolate between points based on progress
                      const currentProgress = Math.min(progress * points.length, i);
                      const segmentProgress = Math.max(0, Math.min(1, currentProgress - (i - 1)));

                      if (segmentProgress > 0) {
                        const x = prevPoint.x + (point.x - prevPoint.x) * segmentProgress;
                        const y = prevPoint.y + (point.y - prevPoint.y) * segmentProgress;
                        ctx.lineTo(x, y);
                      }
                    }
                    ctx.stroke();
                  }
                  ctx.restore();
                }
              },
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
        $(`.period-button-graph[data-period="${latestPeriod}"]`).css({
          backgroundColor: "#007bff",
          borderColor: "#007bff",
          color: "white"
        });
        updateSubjectsAndChart();
      }

       modal.append(settingsButton, periodLabel, periodButtons, subjectLabel, subjectButtons, chartTitle, chartContainer);

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

  $("body")
    .append($("<div>").attr("id", "modal-background-graph"))
    .append(
      $("<div>")
        .attr("id", "modal-content-graph")
        .append($("<button>").attr("id", "modal-close-graph").text("X"))
        .append(MakeGraph())
    );

  $("#modal-background-graph, #modal-close-graph").on("click", () =>
    $("#modal-content-graph, #modal-background-graph").toggleClass("active")
  );
}

function openGraph() {
  $("#modal-content-graph, #modal-background-graph").toggleClass("active");
}


/* -------------------------------------------------------------------------- */
/* 6. CSS (kept inline for simplicity)                                        */
/* -------------------------------------------------------------------------- */

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

#details-grid:hover::before {
  visibility: visible;
  opacity: 0.9;
}

#details-grid::before {
  z-index: 2;
  content: attr(content);
  color: white;
  background-color: #1a1a1a;
  visibility: hidden;
  position: absolute;
  text-align: center;
  padding: 0.313rem 0;
  border-radius: 0.375rem;
  opacity: 0;
  transition: opacity .6s;
  width: 15rem;
  top: 100%;
  left: 50%;
  margin-left: -7.5rem;
}

#result-table-grid .hidden-cell-grid {
  border: none !important;
}

.period_button-grid {
  background-color: #ff520e;
  border-radius: 3px;
  border-style: none;
  color: #FFFFFF;
  margin-right: 0.5rem;
  padding: 0.4rem;
  text-align: center;
  transition: 100ms;
}

.period_button-grid:hover {
  background-color: #ef4200;
}

.period_button-grid:active {
  background-color: #ff6210;
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
  border: 1px solid gray !important;
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
  background-color: white;
  opacity: .50;
  z-index: 1000;
}

#modal-content-grid {
  background-color: white;
  border-radius: 10px;
  box-shadow: 0 0 20px 0 #222;
  display: none;
  padding: 10px;
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
  padding: 0.4rem;
  text-align: center;
  transition: 100ms;
  position: absolute;
  right: 0.5rem;
  background: none;
  border: none;
}

#modal-close-grid:hover {
  color: #dd0000;
}

#modal-close-grid:active {
  color: #ff0000;
}`;


const FILTER_CSS = `
#filter-container-grid {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
  padding: 10px;
  background-color: #f5f5f5;
  border-radius: 4px;
}

#date-filter-input {
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

#filter-type-select {
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

#apply-filter-btn, #clear-filter-btn {
  padding: 5px 10px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

#clear-filter-btn {
  background-color: #f44336;
}

#apply-filter-btn:hover {
  background-color: #45a049;
}

#clear-filter-btn:hover {
  background-color: #d32f2f;
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
  border: none;
  color: white;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.period-control-button-grid:hover {
  background-color: #218838;
}

#reset-periods-grid {
  background-color: #dc3545;
}

#reset-periods-grid:hover {
  background-color: #c82333;
}

@media (max-width: 768px) {
  #filter-container-grid {
    flex-direction: column;
    align-items: flex-start;
  }

  #period-checkboxes-grid {
    flex-direction: column;
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

/* --- MODAL --- */
#modal-background-graph {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: white;
  opacity: .50;
  z-index: 1000;
}

#modal-content-graph {
  background-color: white;
  border-radius: 10px;
  box-shadow: 0 0 20px 0 #222;
  display: none;
  padding: 10px;
  position: fixed;
  z-index: 1000;
  left: 10%;
  top: 10%;
  width: 80%;
  height: 80%;
}

#modal-background-graph.active,
#modal-content-graph.active {
  display: block;
}

#modal-close-graph {
  font-family: 'Poppins', sans-serif;
  color: rgb(100, 100, 100);
  padding: 0.4rem;
  text-align: center;
  transition: 100ms;
  position: absolute;
  right: 0.5rem;
  background: none;
  border: none;
}

#modal-close-graph:hover {
  color: #dd0000;
}

 #modal-close-graph:active {
   color: #ff0000;
 }

 .selected-subject {
   background-color: #28a745 !important;
   border-color: #28a745 !important;
   color: white !important;
 }

  .selected-subject:hover {
    background-color: #218838 !important;
  }

  /* Settings button - larger and better positioned */
  #graph-settings-button {
    transition: all 0.2s ease;
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)";
  }

  #graph-settings-button:hover {
    background-color: #5a6268 !important;
    transform: scale(1.05);
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)";
  }

  #graph-settings-button:active {
    transform: scale(0.95);
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
