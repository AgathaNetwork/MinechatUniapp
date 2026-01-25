package io.dcloud.feature.uniapp.common;

/**
 * 仅用于本地/CI 编译 AAR 的最小 stub（compileOnly）。
 * 注意：此类不会被打进最终 AAR，以避免与 uni-app 运行时自带的 UniModule 冲突。
 */
public class UniModule {
	// 真实 uni-app 运行时里该字段存在；这里仅为编译通过（compileOnly）。
	protected Object mUniSDKInstance;
}
