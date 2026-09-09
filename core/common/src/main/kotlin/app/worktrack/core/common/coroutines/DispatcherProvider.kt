package app.worktrack.core.common.coroutines

import javax.inject.Inject
import javax.inject.Qualifier
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers

/** Injectable dispatchers so coroutine context is swappable in tests. */
interface DispatcherProvider {
    val io: CoroutineDispatcher
    val default: CoroutineDispatcher
    val main: CoroutineDispatcher
}

class DefaultDispatcherProvider @Inject constructor() : DispatcherProvider {
    override val io: CoroutineDispatcher = Dispatchers.IO
    override val default: CoroutineDispatcher = Dispatchers.Default
    override val main: CoroutineDispatcher = Dispatchers.Main
}

/** Application-lifetime CoroutineScope (SupervisorJob + Default), provided by the app module. */
@Qualifier
@Retention(AnnotationRetention.RUNTIME)
annotation class ApplicationScope
