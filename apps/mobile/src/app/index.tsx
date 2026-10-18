import { Text, View } from 'react-native';
import { CONTRACTS_VERSION } from '@hunarpramaan/contracts';
import { coverage } from '@hunarpramaan/scoring';
import { sha256Hex } from '@hunarpramaan/audit';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>
        हुनर प्रमाण {CONTRACTS_VERSION} {typeof coverage} {sha256Hex(new Uint8Array([1]))}
      </Text>
    </View>
  );
}
