# Reports Endpoint Refinement Summary

## Issues Identified

1. **Comments could be saved before reports were saved** - Users could try to save head/teacher comments on reports that didn't exist in the database yet (no `id`)
2. **No search/filter capabilities** - Could only view reports by exact class/term/examType combination
3. **Unclear workflow** - No clear distinction between generated (unsaved) and saved reports
4. **Poor error handling** - Errors when saving comments on unsaved reports were unclear

## Solutions Implemented

### 1. Backend Changes

#### Fixed Comment Save Methods
- **`saveHeadComment`**: Now requires `report.id` to exist. Throws `BadRequestException` if report is not saved first
- **`saveTeacherComment`**: Now requires `report.id` to exist. Throws `BadRequestException` if report is not saved first
- Both methods now:
  - Validate that report exists in database
  - Find existing report by ID
  - Update only the comment field
  - Return clear error messages

#### Added Search/Filter Endpoint
- **`GET /reports/search`**: New endpoint with query parameters:
  - `studentNumber` - Filter by student
  - `name` - Filter by class name
  - `num` - Filter by term number
  - `year` - Filter by year
  - `examType` - Filter by exam type
- Returns up to 100 results, ordered by year (DESC), term (DESC), studentNumber (ASC)
- Protected by `PERMISSIONS.REPORTS.VIEW`

### 2. Frontend Changes

#### Report Component Updates
- **Added `isReportSaved` getter**: Checks if `report.id` exists
- **Added `canEditComments` getter**: Only true if report is saved
- **Updated template**: Comment editing fields only show if `canEditComments` is true
- **Added warning messages**: Shows info message when trying to edit comments on unsaved reports
- **Updated save methods**: Both `saveComment()` and `saveTeacherComment()` check if report is saved first

#### Visual Indicators
- Warning message displayed when user tries to edit comments on unsaved reports
- Comment fields are hidden/disabled for unsaved reports
- Clear visual feedback about report save status

### 3. Workflow Improvements

**Correct Workflow:**
1. **Generate** → Creates reports in memory (no DB save)
2. **Review/Edit** → User can review generated reports
3. **Save** (Admin only) → Saves reports to database (assigns IDs)
4. **Edit Comments** → Only after save, users can add/edit head/teacher comments

**Previous (Broken) Workflow:**
- Users could try to save comments before saving reports
- Would fail with unclear errors
- Could create orphaned data

## API Endpoints

### Existing Endpoints (Refined)
- `GET /reports/generate/:name/:num/:year/:examType` - Generate reports (unchanged)
- `POST /reports/save/:name/:num/:year/:examType` - Save reports (unchanged)
- `GET /reports/view/:name/:num/:year/:examType` - View saved reports (unchanged)
- `POST /reports/save/` - Save head comment (now requires report.id)
- `POST /reports/save-teacher-comment` - Save teacher comment (now requires report.id)

### New Endpoints
- `GET /reports/search?studentNumber=...&name=...&num=...&year=...&examType=...` - Search/filter reports

## Error Handling

### Before
- Generic errors when saving comments
- No clear indication that report must be saved first
- Could fail silently or with confusing messages

### After
- Clear `BadRequestException` with message: "Cannot save comment: Report must be saved to database first. Please save the report before adding comments."
- Frontend prevents comment editing on unsaved reports
- Visual warnings guide users to correct workflow

## Future Enhancements (Not Implemented Yet)

1. **Advanced Search UI** - Add search form to frontend
2. **Report Status Indicators** - Visual badges showing "Saved" vs "Unsaved"
3. **Bulk Comment Editing** - Allow editing multiple comments at once
4. **Comment History** - Track comment changes over time
5. **Export with Comments** - Ensure PDF exports include all comments

## Testing Recommendations

1. Test saving comments on unsaved reports (should fail with clear error)
2. Test saving comments on saved reports (should work)
3. Test search endpoint with various filter combinations
4. Test workflow: Generate → Save → Edit Comments
5. Verify admin-only save button visibility and enablement


