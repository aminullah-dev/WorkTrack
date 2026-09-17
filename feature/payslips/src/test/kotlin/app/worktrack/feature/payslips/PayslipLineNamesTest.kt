package app.worktrack.feature.payslips

import app.worktrack.core.model.PayComponentType
import app.worktrack.core.model.PayslipLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PayslipLineNamesTest {

    private fun line(code: String, name: String) = PayslipLine(code, name, PayComponentType.EARNING, 1.0)

    @Test
    fun payrollWrittenLinesAreTranslated() {
        assertEquals(R.string.pay_basic, builtInNameRes(line("BASIC", "معاش اساسی")))
        assertEquals(R.string.pay_absence, builtInNameRes(line("LOP", "کسر غیرحاضری")))
        assertEquals(R.string.pay_income_tax, builtInNameRes(line("TAX", "مالیهٔ معاش")))
    }

    @Test
    fun companyComponentsKeepTheirName() {
        assertNull(builtInNameRes(line("TRANSPORT", "کمک ترانسپورت")))
    }
}
