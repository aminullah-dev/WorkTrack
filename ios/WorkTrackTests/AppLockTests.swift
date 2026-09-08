import XCTest
@testable import WorkTrack

/// The app lock.
///
/// Every case here is about the same thing: a privacy setting must never cost
/// somebody their attendance.
@MainActor
final class AppLockTests: XCTestCase {

    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: "worktrack.applock")
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: "worktrack.applock")
        super.tearDown()
    }

    func testOffByDefault() {
        // A biometric prompt on every launch, unasked for, is the kind of thing
        // that gets an app deleted.
        let lock = AppLock()
        XCTAssertFalse(lock.isEnabled)
        XCTAssertFalse(lock.isLocked)
    }

    func testEnablingPersists() {
        AppLock().setEnabled(true)
        // Only if the device can actually do it — a simulator without a
        // passcode cannot, and the setting must not pretend otherwise.
        let reopened = AppLock()
        XCTAssertEqual(reopened.isEnabled, reopened.isAvailable)
    }

    func testCannotBeEnabledOnAPhoneThatCannotLock() {
        let lock = AppLock()
        lock.setEnabled(true)
        if !lock.isAvailable {
            XCTAssertFalse(lock.isEnabled, "enabled on a device with no passcode")
        }
    }

    func testDisablingClearsIt() {
        let lock = AppLock()
        lock.setEnabled(true)
        lock.setEnabled(false)
        XCTAssertFalse(lock.isEnabled)
        XCTAssertFalse(AppLock().isEnabled)
    }

    func testLockingDoesNothingWhenTheSettingIsOff() {
        let lock = AppLock()
        lock.setEnabled(false)
        lock.lockIfNeeded()
        XCTAssertFalse(lock.isLocked)
    }

    func testUnlockIsAPassThroughWhenDisabled() async {
        // Otherwise turning the setting off would leave somebody staring at a
        // lock screen they can no longer dismiss.
        let lock = AppLock()
        lock.setEnabled(false)
        lock.lockIfNeeded()
        await lock.unlock()
        XCTAssertFalse(lock.isLocked)
    }
}
