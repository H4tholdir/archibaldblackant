import { DelayManager } from './delay-manager';

/**
 * Operation Registry - Maps all bot operations with numeric IDs
 *
 * Naming convention: {id}_{phase}_{action}
 * - id: 3-digit numeric (001-999)
 * - phase: login, search, order, items, etc.
 * - action: descriptive action name
 */

export const OPERATIONS = {
  // ============================================================================
  // LOGIN PHASE (001-019)
  // ============================================================================
  LOGIN_NAVIGATE: '001_login_navigate',
  LOGIN_WAIT_USERNAME: '002_login_wait_username',
  LOGIN_CLICK_USERNAME: '003_login_click_username',
  LOGIN_TYPE_USERNAME: '004_login_type_username',
  LOGIN_CLICK_PASSWORD: '005_login_click_password',
  LOGIN_TYPE_PASSWORD: '006_login_type_password',
  LOGIN_CLICK_LOGIN_BUTTON: '007_login_click_login_button',
  LOGIN_WAIT_HOME: '008_login_wait_home',

  // ============================================================================
  // CUSTOMER SEARCH PHASE (020-039)
  // ============================================================================
  CUSTOMER_OPEN_MENU: '020_customer_open_menu',
  CUSTOMER_CLICK_NEW_ORDER: '021_customer_click_new_order',
  CUSTOMER_WAIT_SEARCH_FIELD: '022_customer_wait_search_field',
  CUSTOMER_CLICK_SEARCH_FIELD: '023_customer_click_search_field',
  CUSTOMER_TYPE_SEARCH_TEXT: '024_customer_type_search_text',
  CUSTOMER_PRESS_TAB: '025_customer_press_tab',
  CUSTOMER_WAIT_RESULTS: '026_customer_wait_results',
  CUSTOMER_CLICK_RESULT: '027_customer_click_result',
  CUSTOMER_PRESS_TAB_AFTER_RESULT: '028_customer_press_tab_after_result',
  CUSTOMER_PRESS_ENTER_CONFIRM: '029_customer_press_enter_confirm',

  // ============================================================================
  // ORDER CREATION PHASE (040-059)
  // ============================================================================
  ORDER_WAIT_FORM: '040_order_wait_form',
  ORDER_CLICK_DELIVERY_DATE: '041_order_click_delivery_date',
  ORDER_TYPE_DELIVERY_DATE: '042_order_type_delivery_date',
  ORDER_PRESS_TAB_AFTER_DATE: '043_order_press_tab_after_date',
  ORDER_PRESS_ENTER_CONFIRM_DATE: '044_order_press_enter_confirm_date',
  ORDER_WAIT_ITEMS_SECTION: '045_order_wait_items_section',

  // ============================================================================
  // ITEM SEARCH & ADD PHASE (060-089)
  // ============================================================================
  ITEM_CLICK_SEARCH_FIELD: '060_item_click_search_field',
  ITEM_TYPE_SEARCH_TEXT: '061_item_type_search_text',
  ITEM_PRESS_TAB: '062_item_press_tab',
  ITEM_WAIT_RESULTS: '063_item_wait_results',
  ITEM_CLICK_RESULT: '064_item_click_result',
  ITEM_PRESS_TAB_AFTER_RESULT: '065_item_press_tab_after_result',
  ITEM_PRESS_ENTER_CONFIRM: '066_item_press_enter_confirm',
  ITEM_WAIT_QUANTITY_FIELD: '067_item_wait_quantity_field',
  ITEM_CLICK_QUANTITY_FIELD: '068_item_click_quantity_field',
  ITEM_CLEAR_QUANTITY: '069_item_clear_quantity',
  ITEM_TYPE_QUANTITY: '070_item_type_quantity',
  ITEM_PRESS_TAB_AFTER_QUANTITY: '071_item_press_tab_after_quantity',
  ITEM_PRESS_ENTER_ADD_ITEM: '072_item_press_enter_add_item',
  ITEM_WAIT_ITEM_ADDED: '073_item_wait_item_added',

  // ============================================================================
  // ORDER FINALIZATION PHASE (090-109)
  // ============================================================================
  FINALIZE_CLICK_SAVE_BUTTON: '090_finalize_click_save_button',
  FINALIZE_WAIT_CONFIRMATION: '091_finalize_wait_confirmation',
  FINALIZE_EXTRACT_ORDER_ID: '092_finalize_extract_order_id',

  // ============================================================================
  // NAVIGATION & UI INTERACTIONS (110-129)
  // ============================================================================
  NAV_PRESS_ESCAPE: '110_nav_press_escape',
  NAV_PRESS_BACKSPACE: '111_nav_press_backspace',
  NAV_PRESS_ARROW_DOWN: '112_nav_press_arrow_down',
  NAV_PRESS_ARROW_UP: '113_nav_press_arrow_up',
  NAV_CLICK_DROPDOWN_ITEM: '114_nav_click_dropdown_item',

  // ============================================================================
  // ERROR HANDLING & SPECIAL CASES (130-149)
  // ============================================================================
  ERROR_DISMISS_POPUP: '130_error_dismiss_popup',
  ERROR_RETRY_OPERATION: '131_error_retry_operation',
  ERROR_SCREENSHOT: '132_error_screenshot',
} as const;

/**
 * Operation descriptions for DelayManager
 */
export const OPERATION_DESCRIPTIONS: Record<string, string> = {
  // Login
  [OPERATIONS.LOGIN_NAVIGATE]: 'Navigate to Archibald login page',
  [OPERATIONS.LOGIN_WAIT_USERNAME]: 'Wait for username field to appear',
  [OPERATIONS.LOGIN_CLICK_USERNAME]: 'Click username input field',
  [OPERATIONS.LOGIN_TYPE_USERNAME]: 'Type username characters',
  [OPERATIONS.LOGIN_CLICK_PASSWORD]: 'Click password input field',
  [OPERATIONS.LOGIN_TYPE_PASSWORD]: 'Type password characters',
  [OPERATIONS.LOGIN_CLICK_LOGIN_BUTTON]: 'Click login submit button',
  [OPERATIONS.LOGIN_WAIT_HOME]: 'Wait for home page to load',

  // Customer Search
  [OPERATIONS.CUSTOMER_OPEN_MENU]: 'Open main menu dropdown',
  [OPERATIONS.CUSTOMER_CLICK_NEW_ORDER]: 'Click "New Order" menu item',
  [OPERATIONS.CUSTOMER_WAIT_SEARCH_FIELD]: 'Wait for customer search field',
  [OPERATIONS.CUSTOMER_CLICK_SEARCH_FIELD]: 'Click customer search field',
  [OPERATIONS.CUSTOMER_TYPE_SEARCH_TEXT]: 'Type customer search text',
  [OPERATIONS.CUSTOMER_PRESS_TAB]: 'Press Tab to trigger search',
  [OPERATIONS.CUSTOMER_WAIT_RESULTS]: 'Wait for search results dropdown',
  [OPERATIONS.CUSTOMER_CLICK_RESULT]: 'Click customer in results',
  [OPERATIONS.CUSTOMER_PRESS_TAB_AFTER_RESULT]: 'Press Tab after selecting customer',
  [OPERATIONS.CUSTOMER_PRESS_ENTER_CONFIRM]: 'Press Enter to confirm customer',

  // Order Creation
  [OPERATIONS.ORDER_WAIT_FORM]: 'Wait for order form to load',
  [OPERATIONS.ORDER_CLICK_DELIVERY_DATE]: 'Click delivery date field',
  [OPERATIONS.ORDER_TYPE_DELIVERY_DATE]: 'Type delivery date',
  [OPERATIONS.ORDER_PRESS_TAB_AFTER_DATE]: 'Press Tab after date',
  [OPERATIONS.ORDER_PRESS_ENTER_CONFIRM_DATE]: 'Press Enter to confirm date',
  [OPERATIONS.ORDER_WAIT_ITEMS_SECTION]: 'Wait for items section to appear',

  // Item Search & Add
  [OPERATIONS.ITEM_CLICK_SEARCH_FIELD]: 'Click item search field',
  [OPERATIONS.ITEM_TYPE_SEARCH_TEXT]: 'Type item search text',
  [OPERATIONS.ITEM_PRESS_TAB]: 'Press Tab to trigger item search',
  [OPERATIONS.ITEM_WAIT_RESULTS]: 'Wait for item search results',
  [OPERATIONS.ITEM_CLICK_RESULT]: 'Click item in results',
  [OPERATIONS.ITEM_PRESS_TAB_AFTER_RESULT]: 'Press Tab after selecting item',
  [OPERATIONS.ITEM_PRESS_ENTER_CONFIRM]: 'Press Enter to confirm item',
  [OPERATIONS.ITEM_WAIT_QUANTITY_FIELD]: 'Wait for quantity field',
  [OPERATIONS.ITEM_CLICK_QUANTITY_FIELD]: 'Click quantity field',
  [OPERATIONS.ITEM_CLEAR_QUANTITY]: 'Clear quantity field (Backspace)',
  [OPERATIONS.ITEM_TYPE_QUANTITY]: 'Type quantity value',
  [OPERATIONS.ITEM_PRESS_TAB_AFTER_QUANTITY]: 'Press Tab after quantity',
  [OPERATIONS.ITEM_PRESS_ENTER_ADD_ITEM]: 'Press Enter to add item',
  [OPERATIONS.ITEM_WAIT_ITEM_ADDED]: 'Wait for item to be added to list',

  // Order Finalization
  [OPERATIONS.FINALIZE_CLICK_SAVE_BUTTON]: 'Click save order button',
  [OPERATIONS.FINALIZE_WAIT_CONFIRMATION]: 'Wait for order confirmation',
  [OPERATIONS.FINALIZE_EXTRACT_ORDER_ID]: 'Extract order ID from UI',

  // Navigation
  [OPERATIONS.NAV_PRESS_ESCAPE]: 'Press Escape key',
  [OPERATIONS.NAV_PRESS_BACKSPACE]: 'Press Backspace key',
  [OPERATIONS.NAV_PRESS_ARROW_DOWN]: 'Press Arrow Down key',
  [OPERATIONS.NAV_PRESS_ARROW_UP]: 'Press Arrow Up key',
  [OPERATIONS.NAV_CLICK_DROPDOWN_ITEM]: 'Click dropdown item',

  // Error Handling
  [OPERATIONS.ERROR_DISMISS_POPUP]: 'Dismiss error popup',
  [OPERATIONS.ERROR_RETRY_OPERATION]: 'Retry failed operation',
  [OPERATIONS.ERROR_SCREENSHOT]: 'Take error screenshot',
};

/**
 * Register all operations with DelayManager
 */
export function registerAllOperations(delayManager: DelayManager): void {
  Object.entries(OPERATION_DESCRIPTIONS).forEach(([id, description]) => {
    delayManager.registerOperation(id, description, 0);
  });
}

/**
 * Get delay for operation (convenience wrapper)
 */
export function getOperationDelay(operationId: string): number {
  return DelayManager.getInstance().getDelay(operationId);
}
