package app.worktrack.feature.payslips.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import app.worktrack.feature.payslips.PayslipsRoute
import app.worktrack.feature.payslips.detail.PayslipDetailRoute
import app.worktrack.feature.payslips.detail.PayslipDetailViewModel

const val PAYSLIPS_ROUTE = "payslips"
const val PAYSLIP_DETAIL_ROUTE = "payslips/{${PayslipDetailViewModel.ARG_PAYSLIP_ID}}"

fun payslipDetailRoute(payslipId: String) = "payslips/$payslipId"

fun NavGraphBuilder.payslipScreens(navController: NavController) {
    composable(route = PAYSLIPS_ROUTE) {
        PayslipsRoute(
            onPayslipClick = { id -> navController.navigate(payslipDetailRoute(id)) },
        )
    }

    composable(
        route = PAYSLIP_DETAIL_ROUTE,
        arguments = listOf(
            navArgument(PayslipDetailViewModel.ARG_PAYSLIP_ID) { type = NavType.StringType },
        ),
        deepLinks = listOf(
            navDeepLink {
                uriPattern = "worktrack://payslips/{${PayslipDetailViewModel.ARG_PAYSLIP_ID}}"
            },
        ),
    ) {
        PayslipDetailRoute(onBack = { navController.popBackStack() })
    }
}
