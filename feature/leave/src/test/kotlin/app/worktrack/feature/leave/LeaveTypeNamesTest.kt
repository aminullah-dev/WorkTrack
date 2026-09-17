package app.worktrack.feature.leave

import app.worktrack.core.model.LeaveType
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LeaveTypeNamesTest {

    private fun type(code: String, name: String) = LeaveType(
        id = code.lowercase(), companyId = "c1", name = name, code = code, colorHex = "#000000",
        isPaid = true, requiresAttachment = false, active = true, updatedAt = Instant.EPOCH,
    )

    @Test
    fun builtInTypesWithTheSeededNameAreTranslated() {
        assertEquals(R.string.leave_type_annual, builtInNameRes(type("ANNUAL", "رخصتی سالانه")))
        assertEquals(R.string.leave_type_sick, builtInNameRes(type("SICK", "رخصتی مریضی")))
    }

    @Test
    fun aNameTheCompanyTypedIsKept() {
        assertNull(builtInNameRes(type("ANNUAL", "رخصتی تفریحی")))
        assertNull(builtInNameRes(type("HAJJ", "رخصتی حج")))
    }
}
